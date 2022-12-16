import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';

interface ZoneDelegationProps {
  parentZone: string;
  /**
   * Must be a subdomain of the parent zone
   */
  delegatedZone: string;
}

/**
 * Delegate zone by looking up nameservers
 */
class ZoneDelegation extends Construct {
  constructor(scope: Construct, id: string, props: ZoneDelegationProps) {
    super(scope, id);

    if (!props.delegatedZone.endsWith(props.parentZone)) {
      throw new Error('delegated zone must be a sub zone of parent zone');
    }

    const hostname = props.delegatedZone.substring(
      0,
      props.delegatedZone.length - props.parentZone.length
    );

    const parentZone = new aws.dataAwsRoute53Zone.DataAwsRoute53Zone(
      this,
      'parentZone',
      {
        name: props.parentZone,
      }
    );

    const delegatedZone = new aws.dataAwsRoute53Zone.DataAwsRoute53Zone(
      this,
      'delegatedZone',
      {
        name: props.delegatedZone,
      }
    );

    new aws.route53Record.Route53Record(this, 'delegationRecords', {
      zoneId: parentZone.id,
      type: 'NS',
      ttl: 3600,
      name: hostname,
      records: delegatedZone.nameServers,
    });
  }
}

export {ZoneDelegation, ZoneDelegationProps};
