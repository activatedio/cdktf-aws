// Collection of functions for static websites on cloudfront

import {Construct} from 'constructs';
import * as aws from '@cdktf/provider-aws';

interface DefaultDocumentFunctionProps {
  defaultDocument?: string;
}

/**
 * Use to set a default document on any directory
 */
class DefaultDocumentFunction extends Construct {
  public readonly function: aws.cloudfrontFunction.CloudfrontFunction;

  constructor(
    scope: Construct,
    id: string,
    props: DefaultDocumentFunctionProps
  ) {
    super(scope, id);

    const defaultDocument = props.defaultDocument || 'index.html';

    const source = `function handler(event) {
  var request = event.request;
  var uri = request.uri;
  
  // Check whether the URI is missing a file name.
  if (uri.endsWith('/')) {
      request.uri += '${defaultDocument}';
  } 
  // Check whether the URI is missing a file extension.
  else if (!uri.includes('.')) {
      request.uri += '/${defaultDocument}';
  }

  return request;
}
    `;

    this.function = new aws.cloudfrontFunction.CloudfrontFunction(
      this,
      'function',
      {
        name: 'CloudFrontDefaultDocumentFunction',
        runtime: 'cloudfront-js-1.0',
        comment: 'Redirect to default document',
        publish: true,
        code: source,
      }
    );
  }
}

export {DefaultDocumentFunction};
