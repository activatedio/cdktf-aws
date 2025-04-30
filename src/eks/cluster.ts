import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import * as tls from '@cdktf/provider-tls';
import {Tags} from '../tags';
import fluentLogging from '../iampolicies/fluent-logging.json';

interface NodeGroupProps {
  name: string;
  desiredSize: number;
  maxSize: number;
  minSize: number;
  amiType?: string;
  instanceTypes: string[];
  diskSize?: number;
  capacityType?: string;
  subnetIds: string[];
}

interface IFargateSelectorProps {
  namespace: string;
}

interface IFargateProfileProps {
  name: string;
  selectors: IFargateSelectorProps[];
}

interface IClusterAccessEntry {
  principalArn: string;
  policies: IClusterAccessPolicy[];
}

interface IClusterAccessPolicy {
  policyArn: string;
  type: string;
  namespaces?: string[];
}

interface ClusterProps {
  region: string;
  name: string;
  vpcId: string;
  subnetIds: string[];
  // CIDR Blocks which can access the cluster for management
  accessCidrs: string[];
  nodeGroups?: NodeGroupProps[];
  fargateProfiles?: IFargateProfileProps[];
  accessEntries: IClusterAccessEntry[];
  tags: Tags;
}

/**
 * Opinionated setup of EKS cluster, including IAM roles, and node groups
 */
class Cluster extends Construct {
  public readonly cluster: aws.eksCluster.EksCluster;
  public readonly federatedRole: aws.iamRole.IamRole;
  public readonly fargateRole?: aws.iamRole.IamRole;

  constructor(scope: Construct, id: string, props: ClusterProps) {
    super(scope, id);

    const iamSuffix = `${props.region}_${props.name}`;

    const clusterRole = new aws.iamRole.IamRole(this, 'roleEks', {
      name: `EksRolePolicy_${iamSuffix}`,
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
      new aws.iamRolePolicyAttachment.IamRolePolicyAttachment(
        this,
        'rolePolicyAttachmentEks',
        {
          role: clusterRole.id,
          policyArn: 'arn:aws:iam::aws:policy/AmazonEKSClusterPolicy',
        }
      );

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

    const sg = new aws.securityGroup.SecurityGroup(this, 'securityGroup', {
      name: `eks-cluster-access-${props.name}`,
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
      accessConfig: {
        authenticationMode: 'API',
        bootstrapClusterCreatorAdminPermissions: false,
      },
      tags: props.tags.getTags(),
      dependsOn: [clusterRole, clusterRoleAttachment],
    });

    props.accessEntries.forEach((ae, i) => {
      const entryName = `accessEntry_${i}`;
      new aws.eksAccessEntry.EksAccessEntry(this, entryName, {
        clusterName: this.cluster.name,
        principalArn: ae.principalArn,
      });
      ae.policies.forEach((p, j) => {
        new aws.eksAccessPolicyAssociation.EksAccessPolicyAssociation(
          this,
          `${entryName}_policy_${j}`,
          {
            clusterName: this.cluster.name,
            principalArn: ae.principalArn,
            policyArn: p.policyArn,
            accessScope: {
              type: p.type,
              namespaces: p.namespaces,
            },
          }
        );
      });
    });

    const oidcIssuer = this.cluster.identity.get(0).oidc.get(0).issuer;

    const tlsCert = new tls.dataTlsCertificate.DataTlsCertificate(this, 'tls', {
      url: oidcIssuer,
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
      name: `EksRoleFederatedPolicy_${iamSuffix}`,
    });

    const nodeGroupRole = new aws.iamRole.IamRole(this, 'nodeGroupRole', {
      name: `EksNodeGroup_${iamSuffix}`,
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
          `nodeGroupRoleAttachment_${i}`,
          {
            policyArn: policy,
            role: nodeGroupRole.name,
          }
        )
      );
    }

    if (props.nodeGroups) {
      for (let i = 0; i < props.nodeGroups.length; i++) {
        const nodeGroupProps = props.nodeGroups[i];

        new aws.eksNodeGroup.EksNodeGroup(this, `nodeGroup_${i}`, {
          clusterName: this.cluster.name,
          nodeGroupName: nodeGroupProps.name,
          nodeRoleArn: nodeGroupRole.arn,
          subnetIds: nodeGroupProps.subnetIds,
          instanceTypes: nodeGroupProps.instanceTypes,
          diskSize: nodeGroupProps.diskSize,
          capacityType: nodeGroupProps.capacityType,
          amiType: nodeGroupProps.amiType,
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
    }

    if (props.fargateProfiles) {
      this.fargateRole = new aws.iamRole.IamRole(this, 'fargateRole', {
        name: `EksFargateProfile_${iamSuffix}`,
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
        tags: props.tags.getTags(),
      });

      new aws.iamRolePolicyAttachment.IamRolePolicyAttachment(
        this,
        'fargateRolePolicyAttachment',
        {
          policyArn:
            'arn:aws:iam::aws:policy/AmazonEKSFargatePodExecutionRolePolicy',
          role: this.fargateRole.name,
        }
      );

      const loggingPolicy = new aws.iamPolicy.IamPolicy(
        this,
        'fargateLoggingPolicy',
        {
          name: `EksFargateLogging_${iamSuffix}`,
          policy: `{
            "Version": "2012-10-17",
            "Statement": [{
              "Effect": "Allow",
              "Action": [
                "logs:CreateLogStream",
                "logs:CreateLogGroup",
                "logs:DescribeLogStreams",
                "logs:PutLogEvents"
              ],
              "Resource": "arn:aws:logs:${props.region}:*"
            }]
          }`,
          tags: props.tags.getTags(),
        }
      );

      new aws.iamRolePolicyAttachment.IamRolePolicyAttachment(
        this,
        'fargateLoggingRolePolicyAttachment',
        {
          policyArn: loggingPolicy.arn,
          role: this.fargateRole.name,
        }
      );

      props.fargateProfiles.forEach(v => {
        new aws.eksFargateProfile.EksFargateProfile(
          this,
          `fargateProfile_${v.name}`,
          {
            clusterName: this.cluster.name,
            fargateProfileName: v.name,
            podExecutionRoleArn: this.fargateRole!.arn,
            subnetIds: props.subnetIds,
            selector: v.selectors.map(p => {
              return {
                namespace: p.namespace,
              };
            }),
            tags: props.tags.getTags(),
          }
        );
      });
    }
  }
}

export {
  Cluster,
  ClusterProps,
  NodeGroupProps,
  IFargateProfileProps,
  IFargateSelectorProps,
  IClusterAccessEntry,
};
