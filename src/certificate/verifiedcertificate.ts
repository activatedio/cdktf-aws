import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';

interface VerifiedCertificateProps {
  zoneId: string;
  domainName: string;
  certificateProvider?: aws.provider.AwsProvider;
  tags: Tags;
  subjectAlternativeNames?: string[];
  skipVerification?: boolean;
}

class VerifiedCertificate extends Construct {
  public certificate: aws.acmCertificate.AcmCertificate;

  constructor(scope: Construct, id: string, props: VerifiedCertificateProps) {
    super(scope, id);

    this.certificate = new aws.acmCertificate.AcmCertificate(this, 'cert', {
      domainName: props.domainName,
      subjectAlternativeNames: props.subjectAlternativeNames,
      provider: props.certificateProvider,
      tags: props.tags.getTags(),
      validationMethod: 'DNS',
    });

    const created: {[key: string]: boolean} = {};

    if (!props.skipVerification) {
      new aws.route53Record.Route53Record(this, 'record', {
        zoneId: props.zoneId,
        name: this.certificate.domainValidationOptions.get(0)
          .resourceRecordName,
        type: this.certificate.domainValidationOptions.get(0)
          .resourceRecordType,
        ttl: 300,
        records: [
          this.certificate.domainValidationOptions.get(0).resourceRecordValue,
        ],
        lifecycle: {
          createBeforeDestroy: false,
        },

        // deduplicate
      });

      created[this.removeWildcard(props.domainName)] = true;

      if (props.subjectAlternativeNames) {
        for (let i = 0; i < props.subjectAlternativeNames.length; i++) {
          const index = i + 1;

          const canonical = this.removeWildcard(
            props.subjectAlternativeNames[i]
          );

          if (created[canonical]) {
            // deduplicate
            continue;
          }

          new aws.route53Record.Route53Record(this, `recordAlt-${i}`, {
            zoneId: props.zoneId,
            name: this.certificate.domainValidationOptions.get(index)
              .resourceRecordName,
            type: this.certificate.domainValidationOptions.get(index)
              .resourceRecordType,
            ttl: 300,
            records: [
              this.certificate.domainValidationOptions.get(index)
                .resourceRecordValue,
            ],
            lifecycle: {
              createBeforeDestroy: false,
            },
          });

          created[canonical] = true;
        }
      }
    }
  }

  private removeWildcard(input: string): string {
    return input.replace('*.', '');
  }
}

export {VerifiedCertificate, VerifiedCertificateProps};
