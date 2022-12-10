import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import * as tls from '@cdktf/provider-tls';

interface ClusterProps {
  name: string;
  subnetIds: string[];
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

    this.cluster = new aws.eksCluster.EksCluster(this, id, {
      name: id,
      roleArn: clusterRole.arn,
      vpcConfig: {
        subnetIds: props.subnetIds,
      },
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
  }
}

export {Cluster, ClusterProps};
