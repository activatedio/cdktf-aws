import {Construct} from 'constructs';
import * as tls from '@cdktf/provider-tls';
import * as aws from '@cdktf/provider-aws';

interface SignedCertProps {
  organizationName: string;
  commonName: string;
  caPrivateKeyPem: string;
  caCertPem: string;
  usage: string;
}

class SignedCert extends Construct {
  public privateKey: tls.privateKey.PrivateKey;
  public cert: aws.acmCertificate.AcmCertificate;

  constructor(scope: Construct, id: string, props: SignedCertProps) {
    super(scope, id);

    this.privateKey = new tls.privateKey.PrivateKey(this, 'private', {
      algorithm: 'RSA',
    });

    const cr = new tls.certRequest.CertRequest(this, 'cr', {
      privateKeyPem: this.privateKey.privateKeyPem,
      subject: {
        commonName: props.commonName,
        organization: props.organizationName,
      },
    });

    const lsc = new tls.locallySignedCert.LocallySignedCert(this, 'lsc', {
      certRequestPem: cr.certRequestPem,
      caPrivateKeyPem: props.caPrivateKeyPem,
      caCertPem: props.caCertPem,
      validityPeriodHours: 87600,
      allowedUses: ['key_encipherment', 'digital_signature', props.usage],
    });

    this.cert = new aws.acmCertificate.AcmCertificate(this, 'root', {
      privateKey: this.privateKey.privateKeyPem,
      certificateBody: lsc.certPem,
      certificateChain: props.caCertPem,
    });
  }
}

export {SignedCert, SignedCertProps};
