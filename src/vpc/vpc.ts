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
  tags?: {[key: string]: string};
}

interface RouteTablePrototypeProps {
  routes?: aws.routeTable.RouteTableRoute[];
  count?: number;
  propagateRoutesForVirtualGateways?: string[];
}

interface IVPNGatewayProps {
  name: string;
  localAsn: string;
}

interface VpcProps {
  cidr: string;
  availabilityZones: string[];
  routeTablePrototypes?: {[key: string]: RouteTablePrototypeProps};
  subnetPrototypes: {[key: string]: SubnetPrototypeProps};
  vpnGateways?: IVPNGatewayProps[];
  tags: Tags;
}

interface RouteProps {
  readonly carrierGatewayId?: string;
  readonly coreNetworkArn?: string;
  readonly destinationCidrBlock?: string;
  readonly destinationIpv6CidrBlock?: string;
  readonly destinationPrefixListId?: string;
  readonly egressOnlyGatewayId?: string;
  readonly gatewayId?: string;
  readonly instanceId?: string;
  readonly localGatewayId?: string;
  readonly natGatewayId?: string;
  readonly networkInterfaceId?: string;
  readonly transitGatewayId?: string;
  readonly vpcEndpointId?: string;
  readonly vpcPeeringConnectionId?: string;
}

class Vpc extends Construct {
  public vpc: aws.vpc.Vpc;
  public subnets: {[key: string]: aws.subnet.Subnet[]} = {};
  public routeTables: {[key: string]: aws.routeTable.RouteTable[]} = {};
  public vpnGateways: {[key: string]: aws.vpnGateway.VpnGateway} = {};

  constructor(scope: Construct, id: string, props: VpcProps) {
    super(scope, id);

    this.vpc = new aws.vpc.Vpc(this, id, {
      cidrBlock: props.cidr,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: props.tags.getTags(),
    });

    if (props.vpnGateways) {
      props.vpnGateways.forEach(gw => {
        this.vpnGateways[gw.name] = new aws.vpnGateway.VpnGateway(
          this,
          `vpnGateway_${gw.name}`,
          {
            amazonSideAsn: gw.localAsn,
            vpcId: this.vpc.id,
            tags: props.tags.withName(`${gw.name}`).getTags(),
          }
        );
      });
    }

    for (const name in props.routeTablePrototypes) {
      const rtProps = props.routeTablePrototypes[name];
      const rtCount = rtProps.count
        ? rtProps.count
        : props.availabilityZones.length;

      const routeTables: aws.routeTable.RouteTable[] = [];
      const propagatingVgws: string[] = [];

      if (rtProps.propagateRoutesForVirtualGateways) {
        rtProps.propagateRoutesForVirtualGateways.forEach(gwName => {
          const vgw = this.vpnGateways[gwName];
          if (!vgw) {
            throw Error(`virtual gateways ${gwName} not found`);
          }
          propagatingVgws.push(vgw.id);
        });
      }

      for (let i = 0; i < rtCount; i++) {
        routeTables.push(
          new aws.routeTable.RouteTable(this, `rt-${name}-${i}`, {
            vpcId: this.vpc.id,
            route: rtProps.routes,
            propagatingVgws: propagatingVgws,
            tags: props.tags
              .withTags({
                class: name,
              })
              .withName(`${name}-${i}`)
              .getTags(),
          })
        );
      }

      this.routeTables[name] = routeTables;
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
        let _tags = props.tags.withName(_name);

        if (subnetProps.tags) {
          _tags = _tags.withTags(subnetProps.tags);
        }

        const subnet = new aws.subnet.Subnet(this, _name, {
          vpcId: this.vpc.id,
          cidrBlock: cidr.toCidrString(),
          availabilityZone: props.availabilityZones[i],
          tags: _tags.withTags({class: name}).getTags(),
        });

        let routeTableId: string | undefined;

        if (subnetProps.routeTableName) {
          const routeTables = this.routeTables[subnetProps.routeTableName];
          routeTableId = routeTables[i % routeTables.length].id;
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

  public addRoute(
    routeTableName: string,
    index: number,
    id: string,
    routeProps: RouteProps
  ) {
    const routeTables = this.routeTables[routeTableName];
    const _index = index % routeTables.length;

    new aws.route.Route(this, `r-${routeTableName}-${id}-${index}`, {
      routeTableId: routeTables[_index].id,
      ...routeProps,
    });
  }
}

export {
  Vpc,
  VpcProps,
  SubnetPrototypeProps,
  RouteTablePrototypeProps,
  IVPNGatewayProps,
};
