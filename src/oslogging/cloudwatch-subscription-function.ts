import {Construct} from 'constructs';
import {Tags} from '../tags';
import * as aws from '@cdktf/provider-aws';
import {AssetType, TerraformAsset} from 'cdktf';
import path = require('path');

interface CloudwatchSubscriptionFunctionProps {
  name: string;
  egressCidr: string;
  vpcId: string;
  subnetIds: string[];
  roleArn: string;
  osEndpoint: string;
  // 'aws', 'elastic'
  osType: string;
  elasticApiKey?: string;
  indexPrefix: string;
  tags: Tags;
}

class CloudwatchSubscriptionFunction extends Construct {
  public readonly lambdaFunction: aws.lambdaFunction.LambdaFunction;

  constructor(
    scope: Construct,
    id: string,
    props: CloudwatchSubscriptionFunctionProps
  ) {
    super(scope, id);

    const securityGroup = new aws.securityGroup.SecurityGroup(
      this,
      'securityGroup',
      {
        vpcId: props.vpcId,
        name: `logging-function-${id}`,
        tags: props.tags.getTags(),
        egress: [
          {
            fromPort: 0,
            toPort: 0,
            protocol: '-1',
            cidrBlocks: [props.egressCidr],
          },
        ],
      }
    );

    const asset = new TerraformAsset(this, 'source', {
      path: path.resolve(__dirname, './lambda-forwarder-' + props.osType),
      type: AssetType.ARCHIVE,
    });

    const variables: any = {
      OS_ENDPOINT: props.osEndpoint,
      INDEX_PREFIX: props.indexPrefix,
    };

    if (props.elasticApiKey) {
      variables['API_KEY'] = props.elasticApiKey;
    }

    this.lambdaFunction = new aws.lambdaFunction.LambdaFunction(
      this,
      'function',
      {
        functionName: `CloudWatchToOpenSearch_${props.name}`,
        runtime: 'nodejs16.x',
        handler: 'index.handler',
        filename: asset.path,
        role: props.roleArn,
        sourceCodeHash: asset.assetHash,
        environment: {
          variables: variables,
        },
        vpcConfig: {
          securityGroupIds: [securityGroup.id],
          subnetIds: props.subnetIds,
        },
      }
    );
  }
}

export {CloudwatchSubscriptionFunction, CloudwatchSubscriptionFunctionProps};
