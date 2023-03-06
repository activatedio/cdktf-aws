import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';
import {IamEksRolePolicy} from './iam-role-policy';

// format of loggroups is [baseGroupPath]/[clusterName]/[groupName]
interface ClusterLogGroupsProps {
  regionName: string;
  clusterName: string;
  baseGroupPath: string;
  groupNames: string[];
  // specified to associate the policy to
  roleName?: string;
  // spcified to create role policy
  serviceAccountRolePolicyInfo?: ClusterLogGroupsSerivceAccountRolePolicyInfo;
  tags: Tags;
}

interface ClusterLogGroupsSerivceAccountRolePolicyInfo {
  issuer: string;
  serviceAccountNamespace: string;
  serviceAccountName: string;
  accountNumber: string;
}

class ClusterLogGroups extends Construct {
  constructor(scope: Construct, id: string, props: ClusterLogGroupsProps) {
    super(scope, id);

    const makeGroupName = (name: string): string => {
      return `${props.baseGroupPath}/${props.clusterName}/${name}`;
    };

    props.groupNames.forEach(n => {
      new aws.cloudwatchLogGroup.CloudwatchLogGroup(this, `cloudWatchLogGroup_${n}`, {
        name: makeGroupName(n),
        retentionInDays: 7,
      });
    });

    const iamPolicyDocument = `{
            "Version":"2012-10-17",
            "Statement":[
               {
                  "Effect":"Allow",
                  "Action": [
                    "logs:CreateLogStream",
                    "logs:DescribeLogStreams",
                    "logs:PutLogEvents",
                    "logs:GetLogEvents"
                  ],
                  "Resource": [${props.groupNames
                    .map(
                      n => `"arn:aws:logs:*:*:log-group:${makeGroupName(n)}:*"`
                    )
                    .join(', ')}] 
               }
            ]
         }`;

    const iamName = `AwsEksLogging_${props.regionName}_${props.clusterName}_${id}`;

    if (props.roleName) {
      const policy = new aws.iamPolicy.IamPolicy(this, 'loggingPolicy', {
        name: iamName,
        policy: iamPolicyDocument,
        tags: props.tags.getTags(),
      });

      new aws.iamRolePolicyAttachment.IamRolePolicyAttachment(
        this,
        'loggingPolicyAttachment',
        {
          role: props.roleName!,
          policyArn: policy.arn,
        }
      );
    } else if (props.serviceAccountRolePolicyInfo) {
      const sarp = props.serviceAccountRolePolicyInfo;

      new IamEksRolePolicy(this, 'iamEksRolePolicy', {
        policies: [
          {
            name: 'cloudwatch',
            policy: iamPolicyDocument,
          },
        ],
        name: iamName,
        serviceAccountNamespace: sarp.serviceAccountNamespace,
        serviceAccountName: sarp.serviceAccountName,
        accountNumber: sarp.accountNumber,
        oidcIssuer: sarp.issuer,
      });
    } else {
      throw new Error(
        'roleArn or serviceAccountRolePolicyInfo must be specified'
      );
    }
  }
}

export {
  ClusterLogGroups,
  ClusterLogGroupsProps,
  ClusterLogGroupsSerivceAccountRolePolicyInfo,
};
