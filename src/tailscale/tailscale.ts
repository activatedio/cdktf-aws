import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';

interface TailscaleProps {
  routes: string[];
  name: string;
  authToken: string;
  acceptRoutes?: boolean;
  keyName?: string;
  instances: TailscaleInstanceProps[];
  tags: Tags;
  iamInstanceProfile?: string;
  vpcId?: string;
}

interface TailscaleInstanceProps {
  name: string;
  subnetId?: string;
}

class Tailscale extends Construct {
  constructor(scope: Construct, id: string, props: TailscaleProps) {
    super(scope, id);

    const image = new aws.dataAwsAmi.DataAwsAmi(this, 'ami', {
      owners: ['099720109477'],
      filter: [
        {
          name: 'name',
          values: [
            'ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*',
          ],
        },
      ],
      mostRecent: true,
    });

    let vpnSubnetIds: string[] | undefined;

    if (props.vpcId) {
      vpnSubnetIds = new aws.dataAwsSubnets.DataAwsSubnets(
        this,
        'vpnSubentIds',
        {
          tags: {
            class: 'vpn',
          },
          filter: [
            {
              name: 'vpc-id',
              values: [props.vpcId],
            },
          ],
        }
      ).ids;
    }

    const securityGroup = new aws.securityGroup.SecurityGroup(
      this,
      'securityGroup',
      {
        vpcId: props.vpcId,
        egress: [
          {
            cidrBlocks: ['0.0.0.0/0'],
            protocol: '-1',
            fromPort: 0,
            toPort: 0,
          },
        ],
      }
    );

    for (let i = 0; i < props.instances.length; i++) {
      const iProps = props.instances[i];

      const acceptRoutes = props.acceptRoutes ? ' --accept-routes' : '';

      const userData = `#! /bin/bash
set +e
apt-get update
apt-get upgrade -y
echo "Starting Tailscale install"
echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' >> /etc/sysctl.d/99-tailscale.conf
sysctl -p /etc/sysctl.d/99-tailscale.conf
curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up --auth-key=${
        props.authToken
      } --advertise-exit-node${acceptRoutes} --advertise-routes=${props.routes.join(
        ','
      )}
echo "Finished Tailscale install"
`;

      new aws.instance.Instance(this, `instance-${i}`, {
        userData: userData,
        userDataReplaceOnChange: true,
        instanceType: 't3a.micro',
        subnetId: iProps.subnetId
          ? iProps.subnetId
          : vpnSubnetIds![i % vpnSubnetIds!.length],
        tags: props.tags.withName(iProps.name).getTags(),
        ami: image.id,
        keyName: props.keyName,
        iamInstanceProfile: props.iamInstanceProfile,
        vpcSecurityGroupIds: [securityGroup.id],
        lifecycle: {
          preventDestroy: true,
          ignoreChanges: 'all',
        },
      });
    }
  }
}

export {Tailscale, TailscaleProps, TailscaleInstanceProps};
