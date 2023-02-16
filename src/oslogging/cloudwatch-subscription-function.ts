import { Construct } from "constructs";
import { Tags } from "../tags";
import * as aws from "@cdktf/provider-aws";
import { AssetType, TerraformAsset } from "cdktf";
import path = require("path");

interface CloudwatchSubscriptionFunctionProps {
    egressCidr: string;
    vpcId: string,
    subnetIds: string[],
    roleArn: string,
    osEndpoint: string,
    indexPrefix: string,
    tags: Tags,
}

class CloudwatchSubscriptionFunction extends Construct {

    constructor(scope: Construct, id: string, props: CloudwatchSubscriptionFunctionProps) {

        super(scope, id)

    const securityGroup = new aws.securityGroup.SecurityGroup(
      this,
      'sgDefault',
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

    const asset = new TerraformAsset(this, "source", {
        path: path.resolve(__dirname, '"./lambda-forwarder/index.js'),
        type:  AssetType.ARCHIVE,
    })

    new aws.lambdaFunction.LambdaFunction(this, "functionDefault", {
       functionName: `CloudWatchToOpenSearch_${id}`,
       runtime: 'nodejs16.x',
       filename: asset.path,
       role: props.roleArn,
       environment: {
        variables: {
          OS_ENDPOINT: props.osEndpoint,
          INDEX_PREFIX: props.indexPrefix,
        }
       },
       vpcConfig: {
        securityGroupIds: [securityGroup.id],
        subnetIds: props.subnetIds,
       } 
    })

    }
}

export { CloudwatchSubscriptionFunction, CloudwatchSubscriptionFunctionProps }