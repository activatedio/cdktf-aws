import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';

interface ZonePairProps {
  vpcId: string;
  name: string;
  skipPublic?: boolean;
  ignoreChanges?: string[];
  tags: Tags;
}

class ZonePair extends Construct {
  public privateZone: aws.route53Zone.Route53Zone;
  public publicZone?: aws.route53Zone.Route53Zone;

  constructor(scope: Construct, id: string, props: ZonePairProps) {
    super(scope, id);

    this.privateZone = new aws.route53Zone.Route53Zone(this, 'private', {
      name: props.name,
      tags: props.tags.getTags(),
      vpc: [
        {
          vpcId: props.vpcId,
        },
      ],
      lifecycle: {
        ignoreChanges: props.ignoreChanges,
      },
    });

    if (!props.skipPublic) {
      this.publicZone = new aws.route53Zone.Route53Zone(this, 'public', {
        name: props.name,
        tags: props.tags.getTags(),
        lifecycle: {
          ignoreChanges: props.ignoreChanges,
        },
      });
    }
  }
}

export {ZonePair, ZonePairProps};
