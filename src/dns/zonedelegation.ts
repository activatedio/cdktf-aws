import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';

interface ZoneDelegationProps {
  parentZoneId: string;
  /**
   * Must be a subdomain of the parent zone
   */
  delegatedZoneId: string;
  delegatedHostname: string;
}

/**
 * Delegate zone by looking up nameservers
 */
class ZoneDelegation extends Construct {
  constructor(scope: Construct, id: string, props: ZoneDelegationProps) {
    super(scope, id);

    const delegatedZone = new aws.dataAwsRoute53Zone.DataAwsRoute53Zone(
      this,
      'delegated',
      {
        zoneId: props.delegatedZoneId,
      }
    );

    new aws.route53Record.Route53Record(this, 'delegationRecords', {
      zoneId: props.parentZoneId,
      type: 'NS',
      ttl: 3600,
      name: props.delegatedHostname,
      records: delegatedZone.nameServers,
    });
  }
}

export {ZoneDelegation, ZoneDelegationProps};
