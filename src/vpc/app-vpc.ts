import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';
import {CIDR, createCIDR} from './cidr';
import {SubnetPrototypeProps, Vpc, RouteTablePrototypeProps} from './vpc';
import {DnsEndpoints, DelegatedZoneProps} from './dnsendpoints';
import * as dns from 'dns';

interface ISubnetAclProps {
  ingress?: aws.networkAcl.NetworkAclIngress[];
  egress?: aws.networkAcl.NetworkAclEgress[];
}

interface INetworkCidrProps {
  thisNetworkCidr: string;
  cidrs: {[key: string]: string};
}

interface IAppVpcProps {
  /**
   * Must be of /16
   */
  cidr: string;
  availabilityZones: string[];
  extraSubnetPrototypes?: {[key: string]: SubnetPrototypeProps};
  extraRouteTablePrototypes?: {[key: string]: RouteTablePrototypeProps};
  networkAcls?: {[key: string]: (props: INetworkCidrProps) => ISubnetAclProps};
  serviceSubnetTags?: {[key: string]: string};
  publicSubnetTags?: {[key: string]: string};
  enableDnsEndpoints?: boolean;
  dnsClientCidrs?: string[];
  dnsDelegatedZones?: DelegatedZoneProps[];
  keyName?: string;
  iamInstanceProfile?: string;
  // "all", "single"
  natGatewayAllocation?: string;
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
 *  - service - x.x.32.0/22
 *  - public - x.x.64.0/22
 */

const PUBLIC = 'public';
const SERVICE = 'service';

class AppVpc extends Vpc {
  public readonly networkAcls: {[key: string]: aws.networkAcl.NetworkAcl} = {};
  public readonly internetGateway: aws.internetGateway.InternetGateway;
  public readonly natGateways: aws.natGateway.NatGateway[] = [];

  constructor(scope: Construct, id: string, props: IAppVpcProps) {
    const _cidr = createCIDR(props.cidr);
    const resolverIP = _cidr.addOctet(3, 2, 32).toCidrString().split('/')[0];
    if (_cidr.mask !== 16) {
      throw new Error('cidr must have /16 mask');
    }

    // We allow for up to 8 az on a subnet mask of 22 (4) (6 * 4 = 32)
    const dataNetworkCidr = _cidr.addOctet(2, 0, 19);
    const dataSubnetCidr = _cidr.addOctet(2, 0, 22);
    const servicesNetworkCidr = dataNetworkCidr.addOctet(2, 32, 19);
    const servicesSubnetCidr = dataNetworkCidr.addOctet(2, 32, 22);
    const publicNetworkCidr = servicesNetworkCidr.addOctet(2, 32, 19);
    const publicSubnetCidr = servicesNetworkCidr.addOctet(2, 32, 22);

    let subnetPrototypes: {[key: string]: SubnetPrototypeProps} = {
      data: {
        networkCidr: dataNetworkCidr.toCidrString(),
        zeroCidr: dataSubnetCidr.toCidrString(),
        routeTableName: 'noEgress',
      },
      service: {
        networkCidr: servicesNetworkCidr.toCidrString(),
        zeroCidr: servicesSubnetCidr.toCidrString(),
        routeTableName: 'natEgress',
        tags: props.serviceSubnetTags,
      },
      public: {
        networkCidr: publicNetworkCidr.toCidrString(),
        zeroCidr: publicSubnetCidr.toCidrString(),
        routeTableName: 'igwEgress',
        tags: props.publicSubnetTags,
      },
    };

    if (props.extraSubnetPrototypes) {
      subnetPrototypes = {
        ...subnetPrototypes,
        ...props.extraSubnetPrototypes,
      };
    }

    const cidrs: {[key: string]: string} = {};

    for (const key in subnetPrototypes) {
      const subnetPrototype = subnetPrototypes[key];
      cidrs[key] = subnetPrototype.networkCidr;
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
        natEgress: {},
        igwEgress: {
          count: 1,
        },
        ...props.extraRouteTablePrototypes,
      },
    });

    this.internetGateway = new aws.internetGateway.InternetGateway(
      this,
      'igw-main',
      {
        vpcId: this.vpc.id,
        tags: props.tags.withName('Name').getTags(),
      }
    );

    if (props.natGatewayAllocation) {
      if (props.natGatewayAllocation === 'all') {
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

          this.natGateways.push(ngw);
        }
      } else if (props.natGatewayAllocation === 'single') {
        const subnet = this.subnets[PUBLIC][0];

        const eip = new aws.eip.Eip(this, 'eip-ngw-main', {
          tags: props.tags.withName('NGW').getTags(),
        });

        const ngw = new aws.natGateway.NatGateway(this, 'ngw-main', {
          allocationId: eip.allocationId,
          subnetId: subnet.id,
          tags: props.tags.withName('Main').getTags(),
        });

        this.natGateways.push(ngw);
      }

      for (let i = 0; i < this.subnets[PUBLIC].length; i++) {
        const ngwId = this.natGateways[i % this.natGateways.length].id;

        this.addRoute('natEgress', i, 'egress-gw', {
          destinationCidrBlock: '0.0.0.0/0',
          natGatewayId: ngwId,
        });
      }
    }

    this.addRoute('igwEgress', 0, 'egress-gw', {
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: this.internetGateway.id,
    });

    // Now we create network access groups for each
    for (const name in this.subnets) {
      const subnets = this.subnets[name];

      let egress: aws.networkAcl.NetworkAclEgress[] | undefined;
      let ingress: aws.networkAcl.NetworkAclIngress[] | undefined;

      if (props.networkAcls) {
        const subnetPrototype = subnetPrototypes[name];

        const aclProps = props.networkAcls[name]({
          thisNetworkCidr: subnetPrototype.networkCidr,
          cidrs: cidrs,
        });
        if (aclProps) {
          egress = aclProps.egress;
          ingress = aclProps.ingress;
        }
      }

      new aws.networkAcl.NetworkAcl(this, `acl-${name}`, {
        vpcId: this.vpc.id,
        subnetIds: subnets.map(s => s.id),
        tags: props.tags.withName(name).getTags(),
        egress: egress,
        ingress: ingress,
      });
    }

    if (props.enableDnsEndpoints) {
      let dnsClientCidrs = [props.cidr];

      if (props.dnsClientCidrs) {
        dnsClientCidrs = [...dnsClientCidrs, ...props.dnsClientCidrs];
      }

      const endpoints = new DnsEndpoints(this, 'dnsEndpoints', {
        prefix: id,
        clientCidrs: dnsClientCidrs,
        forwarders: [resolverIP],
        subnetIds: this.subnets[SERVICE].map(s => s.id),
        delegatedZones: props.dnsDelegatedZones,
        keyName: props.keyName,
        iamInstanceProfile: props.iamInstanceProfile,
        tags: props.tags,
        vpcId: this.vpc.id,
      });

      const dhcpOptions = new aws.vpcDhcpOptions.VpcDhcpOptions(
        this,
        'dhcpOptions',
        {
          domainNameServers: endpoints.addresses,
          tags: props.tags.getTags(),
        }
      );

      new aws.vpcDhcpOptionsAssociation.VpcDhcpOptionsAssociation(
        this,
        'dhcpOptionsAssociation',
        {
          vpcId: this.vpc.id,
          dhcpOptionsId: dhcpOptions.id,
        }
      );
    }
  }
}

export {AppVpc, IAppVpcProps, INetworkCidrProps};
