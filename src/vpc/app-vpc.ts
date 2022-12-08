import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';
import {ZonePair} from '../zonepair';
import {createCIDR} from './cidr';
import {SubnetPrototypeProps, Vpc, RouteTablePrototypeProps} from './vpc';

interface AppVpcProps {
  /**
   * Must be of /16
   */
  cidr: string;
  availabilityZones: string[];
  includePublic?: boolean;
  extraSubnetPrototypes?: {[key: string]: SubnetPrototypeProps};
  extraRouteTablePrototypes?: {[key: string]: RouteTablePrototypeProps};
  tags: Tags;
}

/**
 * Application vpc which uses a standard template to create:
 *  - data, services, and public subnets
 *  - creation of igw and nat gateways
 *  - zone pair
 *
 * Subnets are created with the following logic
 *  - data - x.x.0.0/22
 *  - data - x.x.24.0/22
 *  - data - x.x.48.0/22
 */

const DATA = 'data';
const SERVICE = 'service';
const PUBLIC = 'public';

class AppVpc extends Vpc {
  public networkAcls: {[key: string]: aws.networkAcl.NetworkAcl} = {};

  constructor(scope: Construct, id: string, props: AppVpcProps) {
    const _cidr = createCIDR(props.cidr);
    if (_cidr.mask !== 16) {
      throw new Error('cidr must have /16 mask');
    }

    // We allow for up to 6 az on a subnet mask of 22 (4) (6 * 4 = 24)
    const dataCidr = _cidr.addOctet(2, 0, 22);
    const servicesCidr = dataCidr.addOctet(2, 24, 22);
    const publicCidr = servicesCidr.addOctet(2, 24, 22);

    let subnetPrototypes: {[key: string]: SubnetPrototypeProps} = {
      data: {
        zeroCidr: dataCidr.toCidrString(),
        routeTableName: 'noEgress',
      },
      service: {
        zeroCidr: servicesCidr.toCidrString(),
        routeTableName: 'withEgress',
      },
    };

    if (props.includePublic) {
      subnetPrototypes[PUBLIC] = {
        zeroCidr: publicCidr.toCidrString(),
        routeTableName: 'withEgress',
      };
    }

    if (props.extraSubnetPrototypes) {
      subnetPrototypes = {...subnetPrototypes, ...props.extraSubnetPrototypes};
    }

    super(scope, id, {
      cidr: props.cidr,
      availabilityZones: props.availabilityZones,
      subnetPrototypes,
      tags: props.tags,
      routeTablePrototypes: {
        ...{
          noEgress: {},
          withEgress: {},
        },
        ...props.extraRouteTablePrototypes,
      },
    });

    if (props.includePublic) {
      const subnets = this.subnets.public;

      new aws.internetGateway.InternetGateway(this, 'igw-main', {
        vpcId: this.vpc.id,
        tags: props.tags.withName('Name').getTags(),
      });

      for (let i = 0; i < subnets.length; i++) {
        const subnet = subnets[i];

        const eip = new aws.eip.Eip(this, `eip-ngw-main-${i}`, {
          tags: props.tags.withName(`NGW ${i}`).getTags(),
        });

        new aws.natGateway.NatGateway(this, `ngw-main-${i}`, {
          allocationId: eip.allocationId,
          subnetId: subnet.id,
          tags: props.tags.withName(`Main ${i}`).getTags(),
        });
      }
    }

    // Now we create network access groups for each
    for (const name in this.subnets) {
      const subnets = this.subnets[name];

      const acl = new aws.networkAcl.NetworkAcl(this, `acl-${name}`, {
        vpcId: this.vpc.id,
        subnetIds: subnets.map(s => s.id),
        tags: props.tags.withName(name).getTags(),
      });
    }
  }
}

export {AppVpc, AppVpcProps};
