import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';

interface ZoneDelegationProps {
  parentZoneId: string;
  /**
   * Must be a subdomain of the parent zone
   */
  delegatedZoneId?: string;
  delegatedNameservers?: string[];
  delegatedHostname: string;
}

/**
 * Delegate zone by looking up nameservers
 */
class ZoneDelegation extends Construct {
  constructor(scope: Construct, id: string, props: ZoneDelegationProps) {
    super(scope, id);

    let nameServers: string[];

    if (props.delegatedNameservers) {
      nameServers = props.delegatedNameservers;
    } else if (props.delegatedZoneId) {
      const delegatedZone = new aws.dataAwsRoute53Zone.DataAwsRoute53Zone(
        this,
        'delegated',
        {
          zoneId: props.delegatedZoneId,
        }
      );
      nameServers = delegatedZone.nameServers;
    } else {
      throw new Error(
        'delegatedNameservers or delegatedZoneId must be provided'
      );
    }

    new aws.route53Record.Route53Record(this, 'delegationRecords', {
      zoneId: props.parentZoneId,
      type: 'NS',
      ttl: 3600,
      name: props.delegatedHostname,
      records: nameServers,
    });
  }
}

export {ZoneDelegation, ZoneDelegationProps};
