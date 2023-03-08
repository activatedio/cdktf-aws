import {Construct} from 'constructs';
import {Tags} from '../tags';
import * as aws from '@cdktf/provider-aws';
import {StringResourceConfig} from '@cdktf/provider-random/lib/string-resource';

interface LogIndexProps {
  vpcId: string;
  instanceCount: number;
  instanceType: string;
  ebsVolumeSize: number;
  ebsThroughput: number;
  subnetIds: string[];
  accessCidrBlocks: string[];
  availabilityZoneCount: number;
  // Both custom endpoint and custom endpointCerificateArn have to be specified to enable
  customEndpoint?: string;
  customEndpointCertificateArn?: string;
  tags: Tags;
}

class LogIndex extends Construct {
  public readonly domain: aws.opensearchDomain.OpensearchDomain;

  constructor(scope: Construct, id: string, props: LogIndexProps) {
    super(scope, id);

    const securityGroup = new aws.securityGroup.SecurityGroup(
      this,
      'securityGroup',
      {
        vpcId: props.vpcId,
        name: `logging-search-${id}`,
        tags: props.tags.getTags(),
        ingress: [
          {
            fromPort: 443,
            toPort: 443,
            protocol: 'TCP',
            cidrBlocks: props.accessCidrBlocks,
          },
        ],
      }
    );

    this.domain = new aws.opensearchDomain.OpensearchDomain(this, 'domain', {
      domainName: id,
      engineVersion: 'OpenSearch_2.3',
      vpcOptions: {
        subnetIds: props.subnetIds,
        securityGroupIds: [securityGroup.id],
      },
      clusterConfig: {
        instanceCount: props.instanceCount,
        instanceType: props.instanceType,
        zoneAwarenessEnabled: true,
        zoneAwarenessConfig: {
          availabilityZoneCount: props.availabilityZoneCount,
        },
      },
      domainEndpointOptions: {
        customEndpointEnabled: !!(
          props.customEndpoint && props.customEndpointCertificateArn
        ),
        customEndpoint: props.customEndpoint,
        customEndpointCertificateArn: props.customEndpointCertificateArn,
        enforceHttps: true,
      },
      ebsOptions: {
        ebsEnabled: true,
        volumeSize: props.ebsVolumeSize,
        throughput: props.ebsThroughput,
      },
      encryptAtRest: {enabled: true},
      tags: props.tags.getTags(),
    });

    this.domain.lifecycle = {
      ignoreChanges: [],
    };
  }
}

export {LogIndex, LogIndexProps};
