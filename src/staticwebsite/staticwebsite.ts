import { Construct } from "constructs";
import * as aws from "@cdktf/provider-aws"
import { Tags } from "../tags";

interface StaticWebsiteProps {

  tags: Tags,
}

interface PrivateBucketProps {
  bucketConfig: aws.s3Bucket.S3BucketConfig
  acl: string
}

class WebsiteBucket extends Construct {

  public bucket: aws.s3Bucket.S3Bucket

  constructor(scope: Construct, id: string, props: PrivateBucketProps) {
    
    super(scope, id)

    this.bucket = new aws.s3Bucket.S3Bucket(this, `bucket-${id}`, props.bucketConfig)

    new aws.s3BucketPublicAccessBlock.S3BucketPublicAccessBlock(this, `bucketPublicAccessPolicy-${id}`, {
      bucket: this.bucket.id,
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    })

    new aws.s3BucketAcl.S3BucketAcl(this, `bucketAcl-${id}`, {
      bucket: this.bucket.id,
      acl: props.acl,
    })

    new aws.s3BucketServerSideEncryptionConfiguration.S3BucketServerSideEncryptionConfigurationA(this, `bucketEnc-${id}`, {

      bucket: this.bucket.id,
      rule: [{
        applyServerSideEncryptionByDefault: {
          sseAlgorithm: 'AES256',
        },
      },
      ]
    })

    new aws.s3BucketVersioning.S3BucketVersioningA(this, `bucketVersioning-${id}`, {
      bucket: this.bucket.id,
      versioningConfiguration: {
        status: "Enabled"
      }
    })

  }

}

class StaticWebsite extends Construct {

  constructor(scope: Construct, id: string, props: StaticWebsiteProps) {

    super(scope, id)

    const serverSideEncryption = {
    };

    const sourceName = `${id}-source`;
    const logsName = `${id}-logs`;

    const logsBucket = new WebsiteBucket(this, 'logsBucket', {
      bucketConfig: {
      bucketPrefix: logsName,
      tags: props.tags.withName(logsName).getTags(),
      },
      acl: "log-delivery-write",

    })

    const sourceBucket = new WebsiteBucket(this, "sourceBucket", {
      bucketConfig: {
        bucketPrefix: sourceName,
        logging: {
          targetBucket: logsBucket.bucket.id,
          targetPrefix: "logs/"
        },
      tags: props.tags.withName(sourceName).getTags(),
      },
      acl: "private",
    })

  }
}

export {StaticWebsite, StaticWebsiteProps}