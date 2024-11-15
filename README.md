# cdktf-aws

Opinionated moudules for AWS infrastructure.

## Modules

* [certificate](./src/certificate) - Verified SSL certificates
* [datadog](./src/datadog) - Datadog forwarding
* [dns](./src/dns) - DNS zone population and delegation
* [eks](./src/eks) - EKS
* [iampolicies](./src/iampolicies) - Common IAM policies
* [oslogging](./src/oslogging) - Log aggregation via OpenSearch
* [s3](./src/s3) - S3 buckets
* [staticwebsite](./src/staticwebsite) - Static websites with S3 and CloudFront
* [tags](./src/tags) - Tagging support
* [twingate](./src/twingate) - Tailscale deployment
* [vpc](./src/vpc) - Application vpc setup
* [zonepair](./src/zonepair) - Public / private zone pair

## Conventions

* Avoid abbreviations
* Resource name qualifiers - use underscore "_"
