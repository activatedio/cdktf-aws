import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';
import {CloudformationStack} from '@cdktf/provider-aws/lib/cloudformation-stack';

interface LambdaForwarderProps {
  apiKey: string;
  tags: Tags;
}

/**
 * Deploys CloudFormation stack to setup a data dog log forwarder
 */
class LambdaForwarder extends Construct {
  public readonly functionName = 'datadog-forwarder';
  public readonly stack: CloudformationStack;

  constructor(scope: Construct, id: string, props: LambdaForwarderProps) {
    super(scope, id);

    const apiKeySecret = new aws.secretsmanagerSecret.SecretsmanagerSecret(
      this,
      'secret',
      {
        name: 'datadog_api_key',
        description: 'Encrypted Datadog API Key',
      }
    );

    new aws.secretsmanagerSecretVersion.SecretsmanagerSecretVersion(
      this,
      'secretVersion',
      {
        secretId: apiKeySecret.id,
        secretString: props.apiKey,
      }
    );

    this.stack = new aws.cloudformationStack.CloudformationStack(
      this,
      'stack',
      {
        name: 'datadog-forwarder',
        capabilities: [
          'CAPABILITY_IAM',
          'CAPABILITY_NAMED_IAM',
          'CAPABILITY_AUTO_EXPAND',
        ],
        parameters: {
          DdApiKeySecretArn: apiKeySecret.arn,
          DdSite: 'datadoghq.com',
          FunctionName: this.functionName,
        },
        templateUrl:
          'https://datadog-cloudformation-template.s3.amazonaws.com/aws/forwarder/latest.yaml',
        tags: props.tags.getTags(),
      }
    );
  }
}

export {LambdaForwarder, LambdaForwarderProps};
