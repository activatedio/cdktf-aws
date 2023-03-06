import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Fn} from 'cdktf';

interface IamClusterRolePolicyPolicyProps {
  name: string;
  policyArn?: string;
  policy?: string;
}

interface IamClusterRolePolicyProps {
  policies: IamClusterRolePolicyPolicyProps[];
  name: string;
  accountNumber: string;
  serviceAccountNamespace: string;
  serviceAccountName: string;
  oidcIssuer: string;
}

/**
 * Setup IAM objects and roles for AWS ALB Controller
 */
class IamClusterRolePolicy extends Construct {
  public policies: aws.iamPolicy.IamPolicy[] = [];

  constructor(scope: Construct, id: string, props: IamClusterRolePolicyProps) {
    super(scope, id);

    const policyArns: string[] = [];

    for (let i = 0; i < props.policies.length; i++) {
      const policy = props.policies[i];

      let policyArn = policy.policyArn;

      if (policy.policy) {
        const _policy = new aws.iamPolicy.IamPolicy(this, `iamPolicy_${i}`, {
          name: `${props.name}_${policy.name}`,
          policy: policy.policy,
        });

        this.policies.push(_policy);
        policyArn = _policy.arn;
      }

      policyArns.push(policyArn!);
    }

    const oidcStr = Fn.replace(props.oidcIssuer, 'https://', '');

    const role = new aws.iamRole.IamRole(this, 'iamRole', {
      name: props.name,
      assumeRolePolicy: `
      {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Federated": "arn:aws:iam::${props.accountNumber}:oidc-provider/${oidcStr}"
                },
                "Action": "sts:AssumeRoleWithWebIdentity",
                "Condition": {
                    "StringEquals": {
                        "${oidcStr}:aud": "sts.amazonaws.com",
                        "${oidcStr}:sub": "system:serviceaccount:${props.serviceAccountNamespace}:${props.serviceAccountName}"
                    }
                }
            }
        ]
    }`,
    });

    for (let i = 0; i < policyArns.length; i++) {
      new aws.iamRolePolicyAttachment.IamRolePolicyAttachment(
        this,
        `rolePolicyAttachment_${i}`,
        {
          role: role.id,
          policyArn: policyArns[i],
        }
      );
    }
  }
}

export {IamClusterRolePolicy, IamClusterRolePolicyProps, IamClusterRolePolicyPolicyProps};