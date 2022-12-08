import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';

interface ClusterProps {
  name: string;
}

class Cluster extends Construct {}

export {Cluster, ClusterProps};
