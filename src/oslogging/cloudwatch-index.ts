import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';
import {
  CloudwatchSubscriptionExecutionRole,
  CloudwatchSubscriptionExecutionRoleProps,
} from './cloudwatch-subscription-execution-role';
import {CloudwatchSubscriptionFunction} from './cloudwatch-subscription-function';

interface CloudwatchForwarderProps {
  name: string;
  vpcId: string;
  accountNumber: string;
  subnetIds: string[];
  egressCidr: string;
  region: string;
  // 'aws' or 'elastic'
  osType: string;
  osEndpoint: string;
  // required if osType is 'aws'
  osDomainName?: string;
  useDataStream?: boolean;
  elasticApiKey?: string;
  username?: string;
  password?: string;
  targets: CloudwatchForwarderTargetProps[];
  tags: Tags;
}

interface CloudwatchForwarderTargetProps {
  indexPrefix?: string;
  sources: CloudwatchForwarderSourceProps[];
}

interface CloudwatchForwarderSourceProps {
  logGroupName: string;
  applySubscription: boolean;
  filterPattern: string;
}

class CloudwatchForwarder extends Construct {
  constructor(scope: Construct, id: string, props: CloudwatchForwarderProps) {
    super(scope, id);

    const roleProps: CloudwatchSubscriptionExecutionRoleProps = {
      name: props.name,
      region: props.region,
      tags: props.tags,
    };

    if (props.osType === 'aws' && props.osDomainName) {
      roleProps.domain = {
        accountNumber: props.accountNumber,
        domainName: props.osDomainName,
      };
    }

    const role = new CloudwatchSubscriptionExecutionRole(
      this,
      `cwser-${id}`,
      roleProps
    );

    for (let i = 0; i < props.targets.length; i++) {
      const target = props.targets[i];

      const func = new CloudwatchSubscriptionFunction(this, `cwsf-${id}-${i}`, {
        name: `${props.name}_${i}`,
        roleArn: role.role.arn,
        vpcId: props.vpcId,
        subnetIds: props.subnetIds,
        egressCidr: props.egressCidr,
        tags: props.tags,
        osType: props.osType,
        osEndpoint: props.osEndpoint,
        elasticApiKey: props.elasticApiKey,
        useDataStream: props.useDataStream,
        password: props.password,
        username: props.username,
        indexPrefix: target.indexPrefix,
      });

      for (let j = 0; j < target.sources.length; j++) {
        const source = target.sources[j];

        const lpName = `lpName-${id}-${i}-${j}`;
        const subName = `cwsfi-${id}-${i}-${j}`;

        const lp = new aws.lambdaPermission.LambdaPermission(this, lpName, {
          functionName: func.lambdaFunction.functionName,
          statementId: lpName,
          principal: 'logs.amazonaws.com',
          action: 'lambda:InvokeFunction',
          sourceArn: `arn:aws:logs:${props.region}:${props.accountNumber}:log-group:${source.logGroupName}:*`,
          sourceAccount: props.accountNumber,
        });
        if (source.applySubscription) {
          const sf =
            new aws.cloudwatchLogSubscriptionFilter.CloudwatchLogSubscriptionFilter(
              this,
              subName,
              {
                name: subName,
                filterPattern: source.filterPattern,
                destinationArn: func.lambdaFunction.arn,
                logGroupName: source.logGroupName,
              }
            );

          sf.node.addDependency(lp);
        }
      }
    }
  }
}

export {
  CloudwatchForwarder,
  CloudwatchForwarderProps,
  CloudwatchForwarderTargetProps,
  CloudwatchForwarderSourceProps,
};
