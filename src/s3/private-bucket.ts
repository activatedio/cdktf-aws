import * as aws from '@cdktf/provider-aws';
import {Construct} from 'constructs';

interface PrivateBucketProps {
  bucketConfig: aws.s3Bucket.S3BucketConfig;
  enableVersioning?: boolean;
  acl?: string;
}

class PrivateBucket extends Construct {
  public bucket: aws.s3Bucket.S3Bucket;

  constructor(scope: Construct, id: string, props: PrivateBucketProps) {
    super(scope, id);

    this.bucket = new aws.s3Bucket.S3Bucket(
      this,
      `bucket-${id}`,
      props.bucketConfig
    );

    new aws.s3BucketPublicAccessBlock.S3BucketPublicAccessBlock(
      this,
      `bucketPublicAccessPolicy_${id}`,
      {
        bucket: this.bucket.id,
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      }
    );

    if (props.acl) {
      const controls =
        new aws.s3BucketOwnershipControls.S3BucketOwnershipControls(
          this,
          `bucketOwnershiopControls_${id}`,
          {
            bucket: this.bucket.id,
            rule: {
              objectOwnership: 'BucketOwnerPreferred',
            },
          }
        );

      new aws.s3BucketAcl.S3BucketAcl(this, `bucketAcl_${id}`, {
        bucket: this.bucket.id,
        acl: props.acl,
        dependsOn: [controls],
      });
    }

    new aws.s3BucketServerSideEncryptionConfiguration.S3BucketServerSideEncryptionConfigurationA(
      this,
      `bucketEnc_${id}`,
      {
        bucket: this.bucket.id,
        rule: [
          {
            applyServerSideEncryptionByDefault: {
              sseAlgorithm: 'AES256',
            },
          },
        ],
      }
    );

    new aws.s3BucketVersioning.S3BucketVersioningA(
      this,
      `bucketVersioning_${id}`,
      {
        bucket: this.bucket.id,
        versioningConfiguration: {
          status: props.enableVersioning ? 'Enabled' : 'Disabled',
        },
      }
    );
  }
}

export {PrivateBucket, PrivateBucketProps};
