import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';

interface StaticWebsiteProps {
  viewerCertificate?: aws.cloudfrontDistribution.CloudfrontDistributionViewerCertificate;
  customErrorResponses?: aws.cloudfrontDistribution.CloudfrontDistributionCustomErrorResponse[];
  restrictions?: aws.cloudfrontDistribution.CloudfrontDistributionRestrictions;
  webAclId?: string;
  aliases?: string[];
  tags: Tags;
}

interface PrivateBucketProps {
  bucketConfig: aws.s3Bucket.S3BucketConfig;
  acl: string;
}

class WebsiteBucket extends Construct {
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
      `bucketPublicAccessPolicy-${id}`,
      {
        bucket: this.bucket.id,
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      }
    );

    new aws.s3BucketAcl.S3BucketAcl(this, `bucketAcl-${id}`, {
      bucket: this.bucket.id,
      acl: props.acl,
    });

    new aws.s3BucketServerSideEncryptionConfiguration.S3BucketServerSideEncryptionConfigurationA(
      this,
      `bucketEnc-${id}`,
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
      `bucketVersioning-${id}`,
      {
        bucket: this.bucket.id,
        versioningConfiguration: {
          status: 'Enabled',
        },
      }
    );
  }
}

class StaticWebsite extends Construct {
  public distribution: aws.cloudfrontDistribution.CloudfrontDistribution;
  public sourceBucket: WebsiteBucket;

  constructor(scope: Construct, id: string, props: StaticWebsiteProps) {
    super(scope, id);

    const sourceName = `${id}-source`;
    const logsName = `${id}-logs`;

    const logsBucket = new WebsiteBucket(this, 'logsBucket', {
      bucketConfig: {
        bucketPrefix: logsName,
        tags: props.tags.withName(logsName).getTags(),
      },
      acl: 'log-delivery-write',
    });

    this.sourceBucket = new WebsiteBucket(this, 'sourceBucket', {
      bucketConfig: {
        bucketPrefix: sourceName,
        logging: {
          targetBucket: logsBucket.bucket.id,
          targetPrefix: 'logs/',
        },
        tags: props.tags.withName(sourceName).getTags(),
      },
      acl: 'private',
    });

    const identity =
      new aws.cloudfrontOriginAccessIdentity.CloudfrontOriginAccessIdentity(
        this,
        'identity',
        {}
      );

    new aws.s3BucketPolicy.S3BucketPolicy(this, 'bucketPolicy', {
      bucket: this.sourceBucket.bucket.id,
      policy: `{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "1",
                "Effect": "Allow",
                "Principal": {
                    "AWS": "${identity.iamArn}"
                },
                "Action": [
                    "s3:GetObject"
                ],
                "Resource": "${this.sourceBucket.bucket.arn}/*"
            }
        ]
    }
      `,
    });

    const restrictions: aws.cloudfrontDistribution.CloudfrontDistributionRestrictions =
      props.restrictions
        ? props.restrictions
        : {
            geoRestriction: {
              restrictionType: 'none',
              locations: [],
            },
          };

    const viewerCertificate: aws.cloudfrontDistribution.CloudfrontDistributionViewerCertificate =
      props.viewerCertificate
        ? props.viewerCertificate
        : {
            cloudfrontDefaultCertificate: true,
          };

    this.distribution = new aws.cloudfrontDistribution.CloudfrontDistribution(
      this,
      'distribution',
      {
        webAclId: props.webAclId,
        aliases: props.aliases,
        restrictions: restrictions,
        defaultCacheBehavior: {
          allowedMethods: ['GET', 'HEAD'],
          cachedMethods: ['GET', 'HEAD'],
          compress: true,
          forwardedValues: {
            cookies: {
              forward: 'none',
            },
            queryString: false,
          },
          targetOriginId: 'origin1',
          viewerProtocolPolicy: 'redirect-to-https',
        },
        defaultRootObject: 'index.html',
        customErrorResponse: props.customErrorResponses,
        enabled: true,
        httpVersion: 'http2',
        isIpv6Enabled: true,
        loggingConfig: {
          includeCookies: false,
          bucket: logsBucket.bucket.bucketRegionalDomainName,
          prefix: 'cloudfront-logs',
        },
        origin: [
          {
            domainName: this.sourceBucket.bucket.bucketRegionalDomainName,
            originId: 'origin1',
            s3OriginConfig: {
              originAccessIdentity: identity.cloudfrontAccessIdentityPath,
            },
          },
        ],
        priceClass: 'PriceClass_100',
        viewerCertificate: viewerCertificate,
        comment: `Website: ${id}`,

        tags: props.tags.withName(id).getTags(),
      }
    );
  }
}

export {StaticWebsite, WebsiteBucket, StaticWebsiteProps};
