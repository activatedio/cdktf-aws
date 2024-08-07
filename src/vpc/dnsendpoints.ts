import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';
import {Fn} from 'cdktf';

interface DelegatedZoneProps {
  name: string;
  nameservers: string[];
}

interface DnsEndpointsProps {
  vpcId: string;
  prefix?: string;
  subnetIds: string[];
  forwarders: string[];
  delegatedZones?: DelegatedZoneProps[];
  clientCidrs: string[];
  keyName?: string;
  iamInstanceProfile?: string;
  tags: Tags;
}

class DnsEndpoints extends Construct {
  public readonly addresses: string[] = [];

  constructor(scope: Construct, id: string, props: DnsEndpointsProps) {
    super(scope, id);

    const _prefix = props.prefix ? `${props.prefix}-` : '';

    const image = new aws.dataAwsAmi.DataAwsAmi(this, 'ami', {
      owners: ['099720109477'],
      filter: [
        {
          name: 'name',
          values: ['ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server*'],
        },
      ],
      mostRecent: true,
    });

    const securityGroupName = 'dns-endpoints';

    const ingresses = [
      {
        fromPort: 53,
        toPort: 53,
        protocol: 'UDP',
        cidrBlocks: props.clientCidrs,
      },
    ];

    if (props.keyName) {
      ingresses.push({
        fromPort: 22,
        toPort: 22,
        protocol: 'TCP',
        cidrBlocks: props.clientCidrs,
      });
    }

    const securityGroup = new aws.securityGroup.SecurityGroup(this, 'sg', {
      name: securityGroupName,
      vpcId: props.vpcId,
      ingress: ingresses,
      egress: [
        {
          fromPort: 0,
          toPort: 0,
          protocol: '-1',
          cidrBlocks: ['0.0.0.0/0'],
        },
      ],
      tags: props.tags.withName(securityGroupName).getTags(),
    });

    for (let i = 0; i < props.subnetIds.length; i++) {
      const subnetId = props.subnetIds[i];

      const subnetCidr = new aws.dataAwsSubnet.DataAwsSubnet(
        this,
        `dataSubnet_${i}`,
        {
          id: subnetId,
        }
      );

      const privateIp = Fn.cidrhost(subnetCidr.cidrBlock, 5);

      this.addresses.push(privateIp);

      const delegatedZones = props.delegatedZones ? props.delegatedZones : [];

      const userData = `#! /bin/bash

cat << 'EOF' | sudo tee /etc/netplan/99-custom-dns.yaml
network:
  version: 2
  ethernets:
    ens5:
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
      dhcp4-overrides:
        use-dns: false
        use-domains: false
EOF

netplan generate
netplan apply

apt-get update
apt-get install -y bind9


cat << EOF > /etc/bind/named.conf.options
acl goodclients {
${props.clientCidrs.map(c => `  ${c};`).join('\n')}
  localhost;
  localnets;
};

options {
  directory "/var/cache/bind";

  recursion yes;
  allow-query { goodclients; };

  forwarders {
${props.forwarders.map(c => `  ${c};`).join('\n')}
  };
  forward only;

  dnssec-validation no;

  auth-nxdomain no;    # conform to RFC1035
  listen-on-v6 { any; };
};

${delegatedZones
  .map(
    dz => `
zone "${dz.name}" {
  type forward;
  forwarders { ${dz.nameservers.join(';')}; };
};
`
  )
  .join('\n')}

EOF

systemctl restart bind9

`;

      new aws.instance.Instance(this, `instance-${i}`, {
        userData: userData,
        userDataReplaceOnChange: true,
        count: 1,
        instanceType: 't3a.micro',
        subnetId: subnetId,
        privateIp: privateIp,
        vpcSecurityGroupIds: [securityGroup.id],
        keyName: props.keyName,
        iamInstanceProfile: props.iamInstanceProfile,
        tags: props.tags.withName(`${_prefix}ns${i}`).getTags(),
        ami: image.id,
        lifecycle: {
          ignoreChanges: 'all',
        },
      });
    }
  }
}

export {DnsEndpoints, DnsEndpointsProps, DelegatedZoneProps};
