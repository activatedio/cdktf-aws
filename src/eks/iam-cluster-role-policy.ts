import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Fn} from 'cdktf';

interface IamClusterRolePolicyPolicyProps {
  name?: string;
  policyArn?: string;
  policy?: string;
}
interface IamClusterRolePolicyServiceAccountProps {
  serviceAccountNamespace: string;
  serviceAccountName: string;
}

interface IamClusterRolePolicyProps {
  policies: IamClusterRolePolicyPolicyProps[];
  name: string;
  assumeRolePolicies?: string[];
  serviceAccounts: IamClusterRolePolicyServiceAccountProps[];
  accountNumber: string;
  oidcIssuer: string;
}

/**
 * Setup IAM objects and roles for AWS ALB Controller
 */
class IamClusterRolePolicy extends Construct {
  public role: aws.iamRole.IamRole;
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

    this.role = new aws.iamRole.IamRole(this, 'iamRole', {
      name: props.name,
      assumeRolePolicy: `
      {
        "Version": "2012-10-17",
        "Statement": [
        ${props.serviceAccounts
          .map(sa => {
            return `{
              "Effect": "Allow",
              "Principal": {
                "Federated": "arn:aws:iam::${props.accountNumber}:oidc-provider/${oidcStr}"
              },
              "Action": "sts:AssumeRoleWithWebIdentity",
              "Condition": {
                "StringEquals": {
                  "${oidcStr}:aud": "sts.amazonaws.com",
                  "${oidcStr}:sub": "system:serviceaccount:${sa.serviceAccountNamespace}:${sa.serviceAccountName}"
                }
              }
            }`;
          })
          .concat(props.assumeRolePolicies ? props.assumeRolePolicies : [])
          .join(',')}
        ] 
    }`,
    });

    for (let i = 0; i < policyArns.length; i++) {
      new aws.iamRolePolicyAttachment.IamRolePolicyAttachment(
        this,
        `rolePolicyAttachment_${i}`,
        {
          role: this.role.id,
          policyArn: policyArns[i],
        }
      );
    }
  }
}

export {
  IamClusterRolePolicy,
  IamClusterRolePolicyProps,
  IamClusterRolePolicyPolicyProps,
};
