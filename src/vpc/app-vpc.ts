import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';
import {ZonePair} from '../zonepair';
import {createCIDR} from './cidr';
import {SubnetPrototypeProps, Vpc, RouteTablePrototypeProps} from './vpc';

interface SubnetAclProps {
  ingress?: aws.networkAcl.NetworkAclIngress[];
  egress?: aws.networkAcl.NetworkAclEgress[];
}

interface AppVpcProps {
  /**
   * Must be of /16
   */
  cidr: string;
  availabilityZones: string[];
  extraSubnetPrototypes?: {[key: string]: SubnetPrototypeProps};
  extraRouteTablePrototypes?: {[key: string]: RouteTablePrototypeProps};
  networkAcls?: {[key: string]: SubnetAclProps};
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
  public internetGateway: aws.internetGateway.InternetGateway
  public natGateways: aws.natGateway.NatGateway[] = [];

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
        routeTableName: 'natEgress',
      },
      public: {
        zeroCidr: publicCidr.toCidrString(),
        routeTableName: 'igwEgress',
      },
    };

    if (props.extraSubnetPrototypes) {
      subnetPrototypes = {...subnetPrototypes, ...props.extraSubnetPrototypes};
    }

    super(scope, id, {
      cidr: props.cidr,
      availabilityZones: props.availabilityZones,
      subnetPrototypes,
      tags: props.tags,
      routeTablePrototypes: {
        noEgress: {
          count: 1,
        },
        natEgress: {
        },
        igwEgress: {
          count: 1,
        },
        ...props.extraRouteTablePrototypes,
      },
    });

      this.internetGateway = new aws.internetGateway.InternetGateway(this, 'igw-main', {
        vpcId: this.vpc.id,
        tags: props.tags.withName('Name').getTags(),
      });

      for (let i = 0; i < this.subnets[PUBLIC].length; i++) {

        const subnet = this.subnets[PUBLIC][i];

        const eip = new aws.eip.Eip(this, `eip-ngw-main-${i}`, {
          tags: props.tags.withName(`NGW ${i}`).getTags(),
        });

        const ngw = new aws.natGateway.NatGateway(this, `ngw-main-${i}`, {
          allocationId: eip.allocationId,
          subnetId: subnet.id,
          tags: props.tags.withName(`Main ${i}`).getTags(),
        });

        this.addRoute("natEgress", i, "egress-gw", {
          destinationCidrBlock: "0.0.0.0/0",
          natGatewayId: ngw.id,
        })

        this.natGateways.push(ngw)

      }

      this.addRoute("igwEgress", 0, "egress-gw", {
        destinationCidrBlock: "0.0.0.0/0",
        gatewayId: this.internetGateway.id,
      })

    // Now we create network access groups for each
    for (const name in this.subnets) {

      const subnets = this.subnets[name];

      let egress: aws.networkAcl.NetworkAclEgress[] | undefined
      let ingress: aws.networkAcl.NetworkAclIngress[] | undefined

      if (props.networkAcls) {
        const aclProps = props.networkAcls[name];
        if (aclProps) {
          egress = aclProps.egress
          ingress = aclProps.ingress
        }
      }

      const acl = new aws.networkAcl.NetworkAcl(this, `acl-${name}`, {
        vpcId: this.vpc.id,
        subnetIds: subnets.map(s => s.id),
        tags: props.tags.withName(name).getTags(),
        egress: egress,
        ingress: ingress,
      });
    }
  }
}

export {AppVpc, AppVpcProps};
