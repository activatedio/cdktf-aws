import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws/lib';
import {CIDR, createCIDR} from './cidr';
import {Tags} from '../tags/tags';

interface SubnetPrototypeProps {
  zeroCidr: string;
  // If set, will lookup the route table from the standard set
  routeTableName?: string;
  // If set, will associate the given route table to the subnet
  routeTableId?: string;
}

interface RouteTablePrototypeProps {}

interface VpcProps {
  cidr: string;
  availabilityZones: string[];
  routeTablePrototypes?: {[key: string]: RouteTablePrototypeProps};
  subnetPrototypes: {[key: string]: SubnetPrototypeProps};
  tags: Tags;
}

class Vpc extends Construct {
  public vpc: aws.vpc.Vpc;
  public subnets: {[key: string]: aws.subnet.Subnet[]} = {};
  public routeTables: {[key: string]: aws.routeTable.RouteTable} = {};

  constructor(scope: Construct, id: string, props: VpcProps) {
    super(scope, id);

    this.vpc = new aws.vpc.Vpc(this, id, {
      cidrBlock: props.cidr,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: props.tags.getTags(),
    });

    for (const name in props.routeTablePrototypes) {
      const routeTable = new aws.routeTable.RouteTable(this, `rt-${name}`, {
        vpcId: this.vpc.id,
        tags: props.tags.withName(name).getTags(),
      });

      this.routeTables[name] = routeTable;
    }

    for (const name in props.subnetPrototypes) {
      const subnetProps = props.subnetPrototypes[name];
      const subnets: aws.subnet.Subnet[] = [];
      let cidr: CIDR | undefined;

      for (let i = 0; i < props.availabilityZones.length; i++) {
        if (!cidr) {
          cidr = createCIDR(subnetProps.zeroCidr);
        } else {
          cidr = cidr.next();
        }

        const _name = `${id}-${name}-${i}`;

        const subnet = new aws.subnet.Subnet(this, _name, {
          vpcId: this.vpc.id,
          cidrBlock: cidr.toCidrString(),
          availabilityZone: props.availabilityZones[i],
          tags: props.tags.withName(_name).getTags(),
        });

        let routeTableId: string | undefined;

        if (subnetProps.routeTableName) {
          routeTableId = this.routeTables[subnetProps.routeTableName].id;
        } else if (subnetProps.routeTableId) {
          routeTableId = subnetProps.routeTableId;
        }

        if (routeTableId) {
          new aws.routeTableAssociation.RouteTableAssociation(
            this,
            `rta-${_name}`,
            {
              subnetId: subnet.id,
              routeTableId: routeTableId,
            }
          );
        }

        subnets.push(subnet);
      }

      this.subnets[name] = subnets;
    }
  }
}

export {Vpc, VpcProps, SubnetPrototypeProps, RouteTablePrototypeProps};
