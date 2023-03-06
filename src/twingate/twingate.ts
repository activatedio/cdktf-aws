import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import { Tags } from '../tags';

interface TwingateProps {
  domain: string;
  instances: TwingateInstanceProps[];
  tags: Tags;
}

interface TwingateInstanceProps {
  name: string;
  accessToken: string;
  refreshToken: string;
  subnetId: string;
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
        subnetId: iProps.subnetId,
        tags: props.tags.withName(iProps.name).getTags(),
        ami: image.id,
      });
    }
  }
}

export {Twingate, TwingateProps, TwingateInstanceProps};
