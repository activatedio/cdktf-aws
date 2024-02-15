import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import * as random from '@cdktf/provider-random';
import {Tags} from '../tags';
import {PrivateBucket} from '../s3';
import {DefaultDocumentFunction} from './functions';

interface StaticWebsiteProps {
  accountId: string;
  viewerCertificate?: aws.cloudfrontDistribution.CloudfrontDistributionViewerCertificate;
  customErrorResponses?: aws.cloudfrontDistribution.CloudfrontDistributionCustomErrorResponse[];
  restrictions?: aws.cloudfrontDistribution.CloudfrontDistributionRestrictions;
  webAclId?: string;
  aliases?: string[];
  tags: Tags;
}

class StaticWebsite extends Construct {
  public distribution: aws.cloudfrontDistribution.CloudfrontDistribution;
  public sourceBucket: PrivateBucket;
  public logsBucket: PrivateBucket;

  constructor(scope: Construct, id: string, props: StaticWebsiteProps) {
    super(scope, id);

    const sourceName = `${id}-source`;
    const logsName = `${id}-logs`;

    this.logsBucket = new PrivateBucket(this, 'logsBucket', {
      bucketConfig: {
        bucketPrefix: logsName,
        tags: props.tags.withName(logsName).getTags(),
      },
      enableVersioning: true,
    });

    this.sourceBucket = new PrivateBucket(this, 'sourceBucket', {
      bucketConfig: {
        bucketPrefix: sourceName,
        logging: {
          targetBucket: this.logsBucket.bucket.id,
          targetPrefix: 'logs/',
        },
        tags: props.tags.withName(sourceName).getTags(),
      },
      enableVersioning: true,
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

    const randomSuffix = new random.stringResource.StringResource(
      this,
      'functionSuffix',
      {
        lower: true,
        upper: false,
        special: false,
        length: 8,
      }
    );

    const defaultDocumentFunction = new DefaultDocumentFunction(
      this,
      'defaultFunction',
      {
        defaultDocument: 'index.html',
        functionSuffix: randomSuffix.result,
      }
    );

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
          functionAssociation: [
            {
              eventType: 'viewer-request',
              functionArn: defaultDocumentFunction.function.arn,
            },
          ],
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
        origin: [
          {
            domainName: this.sourceBucket.bucket.bucketRegionalDomainName,
            originId: 'origin1',
          },
        ],
        priceClass: 'PriceClass_100',
        viewerCertificate: viewerCertificate,
        comment: `Website: ${id}`,

        tags: props.tags.withName(id).getTags(),
        lifecycle: {
          ignoreChanges: ['origin'],
        },
      }
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
                    "Service": "cloudfront.amazonaws.com"
                },
                "Action": [
                    "s3:GetObject"
                ],
                "Resource": "${this.sourceBucket.bucket.arn}/*",
                "Condition": {
                    "StringEquals": {
                        "AWS:SourceArn": "arn:aws:cloudfront::${props.accountId}:distribution/${this.distribution.id}"
                    }
                }
            }
        ]
    }
      `,
    });
  }
}

export {StaticWebsite, StaticWebsiteProps};
