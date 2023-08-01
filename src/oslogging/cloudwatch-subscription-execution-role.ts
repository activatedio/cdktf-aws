import {Construct} from 'constructs';
import {Tags} from '../tags';
import * as aws from '@cdktf/provider-aws';

interface CloudwatchSubscriptionExecutionRoleDomainProps {
  accountNumber: string;
  domainName: string;
}

interface CloudwatchSubscriptionExecutionRoleProps {
  name: string;
  region: string;
  domain?: CloudwatchSubscriptionExecutionRoleDomainProps;
  tags: Tags;
}

class CloudwatchSubscriptionExecutionRole extends Construct {
  public role: aws.iamRole.IamRole;

  constructor(
    scope: Construct,
    id: string,
    props: CloudwatchSubscriptionExecutionRoleProps
  ) {
    super(scope, id);

    const iamName = `CWOSSub_${props.name}_${props.region}_${id}`;

    const policyDoc = `{
            "Version": "2012-10-17",
            "Statement": [
                {
                  "Effect": "Allow",
                  "Action": [
                    "ec2:DescribeNetworkInterfaces",
                    "ec2:CreateNetworkInterface",
                    "ec2:DeleteNetworkInterface",
                    "ec2:DescribeInstances",
                    "ec2:AttachNetworkInterface"
                  ],
                  "Resource": "*"
                }${
                  props.domain
                    ? `,
                {
                    "Action": [
                        "es:*"
                    ],
                    "Effect": "Allow",
                    "Resource": "arn:aws:es:${props.region}:${props.domain.accountNumber}:domain/${props.domain.domainName}/*"
                }
                `
                    : ''
                }
            ]
        }
        `;

    const policy = new aws.iamPolicy.IamPolicy(this, 'policy', {
      name: iamName,
      policy: policyDoc,
      tags: props.tags.getTags(),
    });

    this.role = new aws.iamRole.IamRole(this, 'role', {
      name: iamName,
      assumeRolePolicy: `{
                "Version": "2012-10-17",
                "Statement": [
                  {
                    "Effect": "Allow",
                    "Principal": {
                      "Service": "lambda.amazonaws.com"
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
      'attachment0',
      {
        role: this.role.name,
        policyArn: policy.arn,
      }
    );
    new aws.iamRolePolicyAttachment.IamRolePolicyAttachment(
      this,
      'attachment1',
      {
        role: this.role.name,
        policyArn:
          'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      }
    );
  }
}

export {
  CloudwatchSubscriptionExecutionRole,
  CloudwatchSubscriptionExecutionRoleProps,
  CloudwatchSubscriptionExecutionRoleDomainProps,
};
