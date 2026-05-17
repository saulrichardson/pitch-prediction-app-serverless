# ADR: Adopt Serverless Web Architecture

- status: accepted
- date: 2026-05-12
- owners: project maintainers

## Context

This repository owns the cheaper serverless deployment of Pitch Prediction App.
The app cannot use `STORAGE_MODE=memory` in AWS Lambda because Lambda execution
environments are recycled and scaled independently, so per-process memory is not
a reliable place for replay timelines across user clicks.

## Decision

Use AWS serverless stacks for the public demo:

- CloudFront distribution as the public entry point
- Next.js standalone server running as an AWS Lambda container through AWS
  Lambda Web Adapter
- Lambda Function URL as the Lambda HTTP entry point, routed through
  CloudFront for the published URL
- DynamoDB pay-per-request table for game replay, timeline, prediction, and
  audit state
- PitchPredict model Lambda invoked server-side through IAM
- Secrets Manager-generated session secret injected into the web Lambda
- CDK stack name `PitchSequenceServerlessStack`
- CDK stack name `PitchSequenceModelStack` for the model runtime

## Rationale

This shape removes standing web compute and avoids RDS, VPC, and NAT cost while
preserving the product boundaries:

- browser -> web/API boundary remains Next.js
- web/API -> model boundary remains server-side IAM Lambda invocation
- replay/timeline state becomes durable enough for serverless execution
- CloudFront gives a normal public HTTPS entry point
- DynamoDB matches the small, session-oriented data access pattern

Using Lambda Web Adapter is intentionally pragmatic. OpenNext/S3-optimized
static hosting may be a future refinement, but the adapter lets the project keep
the current Next.js app and API routes intact while proving the serverless path
quickly and safely.

## Consequences

The serverless deployment has cold starts. Readiness and product-flow
verification must account for model and web Lambda cold starts.

Static assets are served by the Lambda-backed Next.js server in this version.
That is acceptable for a low-traffic demo. If traffic or performance becomes a
priority, move to an OpenNext-style split where static assets live in S3 and
CloudFront routes dynamic requests to Lambda.

The Lambda Function URL is public because the product demo is public and does
not have a password gate. The browser still cannot call the model directly, and
model invocation remains server-side and IAM-scoped. If the app later needs
edge-only access to the web Lambda, reintroduce CloudFront Origin Access Control
or move to an OpenNext/S3 split with private origins.

DynamoDB is now a supported storage mode for serverless deployments. PostgreSQL
support remains in the codebase for SQL-backed durable mode, but it is not the
default for the low-cost demo path.

ADR 0012 supersedes the original "existing model Lambda" ownership detail. The
model runtime remains a separate Lambda boundary, but it is now owned by a
serverless-native model stack instead of the old App Runner-era stack.

## Verification

Required local checks:

- `npm run typecheck`
- `npm test`
- `npm run test:model`
- `npm run lint`
- `npm run build`
- `npm run infra:synth`

Required deployed checks:

- serverless stack deploys from this repo
- deployed serverless `/ready` returns 200 with `storageMode=dynamodb`
- `npm run verify:product` passes against the serverless CloudFront URL
