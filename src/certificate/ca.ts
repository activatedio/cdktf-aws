import {Construct} from 'constructs';
import * as tls from '@cdktf/provider-tls';
import * as aws from '@cdktf/provider-aws';

interface CAProps {
  privateKeyPem: string;
  organizatoinName: string;
  commonName: string;
}

class CA extends Construct {
  public selfSignedCert: tls.selfSignedCert.SelfSignedCert;
  public ca: aws.acmCertificate.AcmCertificate;

  constructor(scope: Construct, id: string, props: CAProps) {
    super(scope, id);

    this.selfSignedCert = new tls.selfSignedCert.SelfSignedCert(this, 'ssc', {
      privateKeyPem: props.privateKeyPem,
      subject: {
        commonName: props.commonName,
        organization: props.organizatoinName,
      },
      validityPeriodHours: 87600,
      isCaCertificate: true,
      allowedUses: ['cert_signing', 'crl_signing'],
    });

    this.ca = new aws.acmCertificate.AcmCertificate(this, 'ca', {
      privateKey: props.privateKeyPem,
      certificateBody: this.selfSignedCert.certPem,
    });
  }
}

export {CA, CAProps};
