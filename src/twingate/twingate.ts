import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';

interface TwingateProps {
  domain: string;
  instances: TwingateInstanceProps[];
  tags: Tags;
  iamInstanceProfile?: string;
  vpcId?: string;
}

interface TwingateInstanceProps {
  name: string;
  accessToken: string;
  refreshToken: string;
  subnetId?: string;
}

class Twingate extends Construct {
  constructor(scope: Construct, id: string, props: TwingateProps) {
    super(scope, id);

    const image = new aws.dataAwsAmi.DataAwsAmi(this, 'ami', {
      owners: ['617935088040'],
      filter: [
        {
          name: 'name',
          values: ['twingate/images/hvm-ssd/twingate-amd64-*'],
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

      const userData = `#! /bin/bash
sudo mkdir -p /etc/twingate/
HOSTNAME_LOOKUP=$(curl http://169.254.169.254/latest/meta-data/local-hostname)
{
echo TWINGATE_URL="https://${props.domain}.twingate.com"
echo TWINGATE_ACCESS_TOKEN="${iProps.accessToken}"
echo TWINGATE_REFRESH_TOKEN="${iProps.refreshToken}"
echo TWINGATE_LABEL_HOSTNAME=$HOSTNAME_LOOKUP
} > /etc/twingate/connector.conf
sudo systemctl enable --now twingate-connector
`;

      new aws.instance.Instance(this, `instance-${i}`, {
        userData: userData,
        userDataReplaceOnChange: true,
        count: 1,
        instanceType: 't3a.micro',
        subnetId: iProps.subnetId
          ? iProps.subnetId
          : vpnSubnetIds![i % vpnSubnetIds!.length],
        tags: props.tags.withName(iProps.name).getTags(),
        ami: image.id,
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

export {Twingate, TwingateProps, TwingateInstanceProps};
