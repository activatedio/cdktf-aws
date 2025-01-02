import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';

interface IZonePairProps {
  vpcId: string;
  name: string;
  skipPublic?: boolean;
  ignoreChanges?: string[];
  tags: Tags;
}

interface IDataZonePairProps {
  vpcId: string;
  name: string;
  skipPublic?: boolean;
}

class ZonePair extends Construct {
  public privateZone: aws.route53Zone.Route53Zone;
  public publicZone?: aws.route53Zone.Route53Zone;

  constructor(scope: Construct, id: string, props: IZonePairProps) {
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

class DataZonePair extends Construct {
  public privateZone: aws.dataAwsRoute53Zone.DataAwsRoute53Zone;
  public publicZone?: aws.dataAwsRoute53Zone.DataAwsRoute53Zone;

  constructor(scope: Construct, id: string, props: IDataZonePairProps) {
    super(scope, id);

    this.privateZone = new aws.dataAwsRoute53Zone.DataAwsRoute53Zone(
      this,
      'private',
      {
        name: props.name,
        vpcId: props.vpcId,
        privateZone: true,
      }
    );

    if (!props.skipPublic) {
      this.publicZone = new aws.dataAwsRoute53Zone.DataAwsRoute53Zone(
        this,
        'public',
        {
          name: props.name,
          privateZone: false,
        }
      );
    }
  }
}

export {ZonePair, IZonePairProps, DataZonePair, IDataZonePairProps};
