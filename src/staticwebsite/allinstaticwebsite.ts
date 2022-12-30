import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';
import {StaticWebsite} from './staticwebsite';
import {VerifiedCertificate} from '../certificate';

interface AllInResolutionHostname {
  zoneName: string;
  zonePrivate: boolean;
  name: string;
}

interface AllInCertificate {
  zoneName: string;
  domainName: string;
  alternativeNames?: string[];
}

interface AllInWebsiteProps {
  aliases?: string[];
  resolutionHostnames?: AllInResolutionHostname[];
  certificateProvider?: aws.provider.AwsProvider;
  certificate?: AllInCertificate;
  tags: Tags;
}

class AllInWebsite extends Construct {
  constructor(scope: Construct, id: string, props: AllInWebsiteProps) {
    super(scope, id);

    let viewerCert:
      | aws.cloudfrontDistribution.CloudfrontDistributionViewerCertificate
      | undefined;

    if (props.certificate) {
      const zone = new aws.dataAwsRoute53Zone.DataAwsRoute53Zone(
        this,
        'dataCertZone',
        {
          name: props.certificate.zoneName,
        }
      );

      const cert = new VerifiedCertificate(this, 'cert', {
        domainName: props.certificate.domainName,
        subjectAlternativeNames: props.certificate.alternativeNames,
        zoneId: zone.id,
        certificateProvider: props.certificateProvider,
        tags: props.tags,
      });

      viewerCert = {
        acmCertificateArn: cert.certificate.arn,
        sslSupportMethod: 'sni-only',
      };
    }

    const website = new StaticWebsite(this, `website-${id}`, {
      aliases: props.aliases,
      tags: props.tags,
      viewerCertificate: viewerCert,
    });

    if (props.resolutionHostnames) {
      for (let i = 0; i < props.resolutionHostnames.length; i++) {
        const host = props.resolutionHostnames[i];

        const zone = new aws.dataAwsRoute53Zone.DataAwsRoute53Zone(
          this,
          `resolutionZone-${i}`,
          {
            name: host.zoneName,
            privateZone: host.zonePrivate,
          }
        );

        new aws.route53Record.Route53Record(this, `resolutionRecord-${i}`, {
          zoneId: zone.id,
          type: 'A',
          name: host.name,
          alias: [
            {
              zoneId: website.distribution.hostedZoneId,
              name: website.distribution.domainName,
              evaluateTargetHealth: false,
            },
          ],
        });
      }
    }
  }
}

export {
  AllInResolutionHostname,
  AllInCertificate,
  AllInWebsiteProps,
  AllInWebsite,
};
