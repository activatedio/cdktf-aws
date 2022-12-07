import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws/lib';

interface SubnetPrototypeProps {
  zeroCidr: string;
}

interface VpcProps {
  cidr: string;
  availabilityZones: string[];
  subnetPrototypes: {[key: string]: SubnetPrototypeProps};
}

class Vpc extends Construct {
  public vpc: aws.vpc.Vpc;
  //public subnets: {[key: string]: aws.subnet.Subnet[] }

  constructor(scope: Construct, id: string, props: VpcProps) {
    super(scope, id);

    this.vpc = new aws.vpc.Vpc(this, id, {
      cidrBlock: props.cidr,
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });
  }
}

export {Vpc, VpcProps};
