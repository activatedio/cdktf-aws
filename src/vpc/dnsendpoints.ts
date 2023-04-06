import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';
import {Fn} from "cdktf";

interface DelegatedZoneProps {
  name: string;
  nameservers: string[];
}

interface DnsEndpointsProps {
  vpcId: string;
  subnetIds: string[];
  forwarders: string[];
  delegatedZones?: DelegatedZoneProps[];
  clientCidrs: string[];
  keyName?: string;
  tags: Tags;
}

class DnsEndpoints extends Construct {
  constructor(scope: Construct, id: string, props: DnsEndpointsProps) {
    super(scope, id);

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

      const delegatedZones = props.delegatedZones ? props.delegatedZones : [];

      const userData = `#! /bin/bash

cat << EOF > /etc/bind/named.conf.options
acl goodclients {
${props.clientCidrs.map(c => `  ${c};\n`)}
  localhost;
  localnets;
};

options {
  directory "/var/cache/bind";

  recursion yes;
  allow-query { goodclients; };

  forwarders {
${props.forwarders.map(c => `  ${c};\n`)}
  };
  forward only;

  dnssec-validation auto;

  auth-nxdomain no;    # conform to RFC1035
  listen-on-v6 { any; };
};

${delegatedZones.map(
  dz => `
zone "${dz.name}" {
  type forward;
  forwarders { ${dz.nameservers.join(';')}; };
};
`
)}

EOF

apt-get update
apt-get install bind9
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
        tags: props.tags.withName(`ns${i}`).getTags(),
        ami: image.id,
        lifecycle: {
          ignoreChanges: 'all',
        },
      });
    }
  }
}

export {DnsEndpoints, DnsEndpointsProps, DelegatedZoneProps};
