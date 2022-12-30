import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';
import {StaticWebsite} from './staticwebsite';
import {VerifiedCertificate} from '../certificate';

interface AllInResolutionHostname {
  zoneId: string;
  name: string;
}

interface AllInCertificate {
  zoneId: string;
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
  public readonly staticWebsite: StaticWebsite;

  constructor(scope: Construct, id: string, props: AllInWebsiteProps) {
    super(scope, id);

    let viewerCert:
      | aws.cloudfrontDistribution.CloudfrontDistributionViewerCertificate
      | undefined;

    if (props.certificate) {
      const cert = new VerifiedCertificate(this, 'cert', {
        domainName: props.certificate.domainName,
        subjectAlternativeNames: props.certificate.alternativeNames,
        zoneId: props.certificate.zoneId,
        certificateProvider: props.certificateProvider,
        tags: props.tags,
      });

      viewerCert = {
        acmCertificateArn: cert.certificate.arn,
        sslSupportMethod: 'sni-only',
      };
    }

    this.staticWebsite = new StaticWebsite(this, id, {
      aliases: props.aliases,
      tags: props.tags,
      viewerCertificate: viewerCert,
    });

    if (props.resolutionHostnames) {
      for (let i = 0; i < props.resolutionHostnames.length; i++) {
        const host = props.resolutionHostnames[i];

        new aws.route53Record.Route53Record(this, `resolutionRecord-${i}`, {
          zoneId: host.zoneId,
          type: 'A',
          name: host.name,
          alias: [
            {
              zoneId: this.staticWebsite.distribution.hostedZoneId,
              name: this.staticWebsite.distribution.domainName,
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
