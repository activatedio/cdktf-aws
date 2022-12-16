import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';
import {Tags} from '../tags';

interface VerifiedCertificateProps {
  zoneId: string;
  domainName: string;
  certificateProvider?: aws.provider.AwsProvider;
  tags: Tags;
  subjectAlternativeNames?: string[];
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

    new aws.route53Record.Route53Record(this, 'record', {
      zoneId: props.zoneId,
      name: this.certificate.domainValidationOptions.get(0).resourceRecordName,
      type: this.certificate.domainValidationOptions.get(0).resourceRecordType,
      ttl: 300,
      records: [
        this.certificate.domainValidationOptions.get(0).resourceRecordValue,
      ],
      lifecycle: {
        createBeforeDestroy: false,
      },
    });

    if (props.subjectAlternativeNames) {
      for (let i = 0; i < props.subjectAlternativeNames.length; i++) {
        const name = props.subjectAlternativeNames[i];
        const index = i + 1;
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
      }
    }
  }
}

export {VerifiedCertificate, VerifiedCertificateProps};
