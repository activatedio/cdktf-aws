import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import * as tls from '@cdktf/provider-tls';
import {Tags} from '../tags';

interface NodeGroupProps {
  name: string;
  desiredSize: number;
  maxSize: number;
  minSize: number;
  instanceTypes: string[];
  capacityType?: string;
}

interface FargateSelectorProps {
  namespace: string;
}

interface ClusterProps {
  name: string;
  vpcId: string;
  subnetIds: string[];
  // CIDR Blocks which can access the cluster for management
  accessCidrs: string[];
  nodeGroups: NodeGroupProps[];
  includeFargateProfile?: boolean;
  fargateSelectors?: FargateSelectorProps[];
  tags: Tags;
}

class Cluster extends Construct {
  public cluster: aws.eksCluster.EksCluster;
  public federatedRole: aws.iamRole.IamRole;

  constructor(scope: Construct, id: string, props: ClusterProps) {
    super(scope, id);

    const clusterRole = new aws.iamRole.IamRole(this, 'r-eks', {
      name: 'EksRolePolicy_' + id,
      assumeRolePolicy: `
      {
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Principal": {
              "Service": "eks.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
          }
        ]
      }
      `,
    });

    const clusterRoleAttachment =
      new aws.iamRolePolicyAttachment.IamRolePolicyAttachment(this, 'rpa-eks', {
        role: clusterRole.id,
        policyArn: 'arn:aws:iam::aws:policy/AmazonEKSClusterPolicy',
      });

    const sgIngress: aws.securityGroup.SecurityGroupIngress[] = [
      {
        protocol: 'TCP',
        fromPort: 443,
        toPort: 443,
        selfAttribute: true,
      },
      {
        protocol: 'TCP',
        fromPort: 443,
        toPort: 443,
        cidrBlocks: props.accessCidrs,
      },
    ];

    const sg = new aws.securityGroup.SecurityGroup(this, 'sg', {
      name: `cluster-access-${props.name}`,
      vpcId: props.vpcId,
      ingress: sgIngress,
      tags: props.tags.getTags(),
    });

    this.cluster = new aws.eksCluster.EksCluster(this, id, {
      name: props.name,
      roleArn: clusterRole.arn,
      vpcConfig: {
        subnetIds: props.subnetIds,
        endpointPrivateAccess: true,
        endpointPublicAccess: false,
        securityGroupIds: [sg.id],
      },
      tags: props.tags.getTags(),
      dependsOn: [clusterRole, clusterRoleAttachment],
    });

    const tlsCert = new tls.dataTlsCertificate.DataTlsCertificate(this, 'tls', {
      url: this.cluster.identity.get(0).oidc.get(0).issuer,
    });

    const provider = new aws.iamOpenidConnectProvider.IamOpenidConnectProvider(
      this,
      'provider',
      {
        clientIdList: ['sts.amazonaws.com'],
        thumbprintList: [], // ${data.tls_certificate.tls.certificates[*].sha1_fingerprint}
        url: tlsCert.url,
      }
    );

    provider.addOverride(
      'thumbprint_list',
      `\${data.tls_certificate.${tlsCert.friendlyUniqueId}.certificates[*].sha1_fingerprint}`
    );

    const doc = new aws.dataAwsIamPolicyDocument.DataAwsIamPolicyDocument(
      this,
      'iamDoc',
      {
        statement: [
          {
            actions: ['sts:AssumeRoleWithWebIdentity'],
            effect: 'Allow',
            condition: [
              {
                test: 'StringEquals',
                variable: `${provider.url.replace('https://', '')}:sub`,
                values: ['system:serviceaccount:kube-system:aws-node'],
              },
            ],
            principals: [
              {
                identifiers: [provider.arn],
                type: 'Federated',
              },
            ],
          },
        ],
      }
    );

    this.federatedRole = new aws.iamRole.IamRole(this, 'federatedRole', {
      assumeRolePolicy: doc.json,
      name: 'EksRoleFederatedPolicy_' + id,
    });

    const nodeGroupRole = new aws.iamRole.IamRole(this, 'nodeGroupRole', {
      name: `EksNodeGroup_${props.name}`,
      assumeRolePolicy: `
      {
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Principal": {
              "Service": "ec2.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
          }
        ]
      }
      `,
    });

    const nodePolicies = [
      'arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy',
      'arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy',
      'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly',
    ];
    const nodePolicyAttachments: aws.iamRolePolicyAttachment.IamRolePolicyAttachment[] =
      [];

    for (let i = 0; i < nodePolicies.length; i++) {
      const policy = nodePolicies[i];
      nodePolicyAttachments.push(
        new aws.iamRolePolicyAttachment.IamRolePolicyAttachment(
          this,
          `nodeGroupRoleAttachment-${i}`,
          {
            policyArn: policy,
            role: nodeGroupRole.name,
          }
        )
      );
    }

    for (let i = 0; i < props.nodeGroups.length; i++) {
      const nodeGroupProps = props.nodeGroups[i];

      new aws.eksNodeGroup.EksNodeGroup(this, `nodeGroup-${i}`, {
        clusterName: this.cluster.name,
        nodeGroupName: nodeGroupProps.name,
        nodeRoleArn: nodeGroupRole.arn,
        subnetIds: props.subnetIds,
        instanceTypes: nodeGroupProps.instanceTypes,
        capacityType: nodeGroupProps.capacityType,

        scalingConfig: {
          desiredSize: nodeGroupProps.desiredSize,
          maxSize: nodeGroupProps.maxSize,
          minSize: nodeGroupProps.minSize,
        },

        updateConfig: {
          maxUnavailable: 1,
        },

        lifecycle: {
          ignoreChanges: ['scaling_config[0].desired_size'],
        },
      });
    }

    if (props.includeFargateProfile) {
      const fargateRole = new aws.iamRole.IamRole(this, 'fargateRole', {
        name: `EksFargateProfile_${props.name}`,
        assumeRolePolicy: `
      {
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Principal": {
              "Service": "eks-fargate-pods.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
          }
        ]
      }
      `,
      });

      new aws.iamRolePolicyAttachment.IamRolePolicyAttachment(
        this,
        'fargateRolePolicyAttachment',
        {
          policyArn:
            'arn:aws:iam::aws:policy/AmazonEKSFargatePodExecutionRolePolicy',
          role: fargateRole.name,
        }
      );

      new aws.eksFargateProfile.EksFargateProfile(this, 'fargateProfile', {
        clusterName: this.cluster.name,
        fargateProfileName: 'default',
        podExecutionRoleArn: fargateRole.arn,
        subnetIds: props.subnetIds,
        selector: props.fargateSelectors!.map(p => {
          return {
            namespace: p.namespace,
          };
        }),
      });
    }
  }
}

export {Cluster, ClusterProps, NodeGroupProps, FargateSelectorProps};
