import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';
import {CloudwatchSubscriptionExecutionRole} from './cloudwatch-subscription-execution-role';
import {CloudwatchSubscriptionFunction} from './cloudwatch-subscription-function';

interface CloudwatchForwarderProps {
  vpcId: string;
  subnetIds: string[];
  egressCidr: string;
  accountNumber: string;
  region: string;
  domainName: string;
  targets: CloudwatchForwarderTargetProps[];
  tags: Tags;
}

interface CloudwatchForwarderTargetProps {
  osEndpoint: string;
  indexPrefix: string;
  sources: CloudwatchForwarderSourceProps[];
}

interface CloudwatchForwarderSourceProps {
  logGroupName: string;
  filterPattern: string;
  indexPrefix: string;
}

class CloudwatchForwarder extends Construct {
  constructor(scope: Construct, id: string, props: CloudwatchForwarderProps) {
    super(scope, id);

    const role = new CloudwatchSubscriptionExecutionRole(this, `cwser-${id}`, {
      accountNumber: props.accountNumber,
      region: props.region,
      domainName: props.domainName,
      tags: props.tags,
    });

    for (let i = 0; i < props.targets.length; i++) {
      const target = props.targets[i];

      const func = new CloudwatchSubscriptionFunction(this, `cwsf-${id}-${i}`, {
        roleArn: role.role.arn,
        vpcId: props.vpcId,
        subnetIds: props.subnetIds,
        egressCidr: props.egressCidr,
        tags: props.tags,
        osEndpoint: target.osEndpoint,
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

export {
  CloudwatchForwarder,
  CloudwatchForwarderProps,
  CloudwatchForwarderTargetProps,
  CloudwatchForwarderSourceProps,
};
