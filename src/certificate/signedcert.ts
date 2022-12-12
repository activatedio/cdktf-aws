import {Construct} from 'constructs';
import * as tls from '@cdktf/provider-tls';
import * as aws from '@cdktf/provider-aws';

interface SignedCertProps {
  privateKeyPem: string;
  organizationName: string;
  commonName: string;
  caPrivateKeyPem: string;
  caCertPem: string;
  usage: string;
}

class SignedCert extends Construct {
  public cert: tls.locallySignedCert.LocallySignedCert;
  public acmCertificate: aws.acmCertificate.AcmCertificate;

  constructor(scope: Construct, id: string, props: SignedCertProps) {
    super(scope, id);

    const cr = new tls.certRequest.CertRequest(this, 'cr', {
      privateKeyPem: props.privateKeyPem,
      subject: {
        commonName: props.commonName,
        organization: props.organizationName,
      },
    });

    this.cert = new tls.locallySignedCert.LocallySignedCert(this, 'lsc', {
      certRequestPem: cr.certRequestPem,
      caPrivateKeyPem: props.caPrivateKeyPem,
      caCertPem: props.caCertPem,
      validityPeriodHours: 87600,
      allowedUses: ['key_encipherment', 'digital_signature', props.usage],
    });

    this.acmCertificate = new aws.acmCertificate.AcmCertificate(this, 'root', {
      privateKey: props.privateKeyPem,
      certificateBody: this.cert.certPem,
      certificateChain: props.caCertPem,
    });
  }
}

export {SignedCert, SignedCertProps};
