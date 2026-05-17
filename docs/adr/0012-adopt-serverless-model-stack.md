# ADR: Adopt Serverless Model Stack

- status: accepted
- date: 2026-05-17
- owners: project maintainers

## Context

The public web/API path has moved to the serverless stack:

```text
CloudFront -> Lambda Web Adapter web/API -> DynamoDB
```

The web/API path no longer needs App Runner. However, the existing model Lambda
was still owned by the older App Runner-era `PitchSequenceLabStack`. That made
the current serverless deployment clean at runtime but not clean at
infrastructure ownership time: deleting the old stack would also delete the
model Lambda that the serverless web Lambda invokes.

App Runner now exists only as a temporary redirect to the serverless version
during the transition window.

## Decision

Introduce a dedicated `PitchSequenceModelStack` that owns the serverless model
runtime:

- `pitch-sequence-serverless-model-lambda`
- `live` alias
- provisioned concurrency for the warm model lane
- reserved concurrency cap
- model Lambda log group
- model Lambda IAM role

`PitchSequenceServerlessStack` now defaults to invoking
`pitch-sequence-serverless-model-lambda:live`. The target remains overridable
with `MODEL_LAMBDA_FUNCTION_NAME` or `MODEL_LAMBDA_INVOKE_TARGET` during
rollout and rollback.

Keep `PitchSequenceServerlessStack` responsible for the web/API surface:

- CloudFront
- Lambda Web Adapter web function
- DynamoDB state table
- session secret
- web Lambda IAM role, log group, and function URL

The old App Runner-era stack should be retired only after:

- the new model stack is deployed and healthy
- the web Lambda is configured to invoke the new model alias
- product-flow verification passes through the serverless CloudFront URL
- App Runner is confirmed to be redirect-only and not part of the product path

## Rationale

This matches the product architecture: the model service is a separate boundary,
but it should still be native to the current serverless operating model. A
dedicated model stack avoids coupling heavyweight model deployment to the
web/API stack while removing the hidden dependency on the old App Runner stack.

Creating a new model Lambda is lower risk than trying to import/adopt the old
Lambda into a new stack. It gives a straightforward rollback path:

```text
point PitchSequenceServerlessStack back to pitch-sequence-model-lambda:live
```

until the new model stack is verified.

## Consequences

The transition temporarily has two model Lambdas:

- old: `pitch-sequence-model-lambda`
- new: `pitch-sequence-serverless-model-lambda`

The old model Lambda, old App Runner redirect service, and old stack can be
deleted after the transition window. Until then, App Runner remains alive only
to redirect to the serverless version.

The standing cost after cleanup is dominated by the new model Lambda provisioned
concurrency, not App Runner.

## Verification

Before retiring the old stack:

- deploy `PitchSequenceModelStack`
- verify `pitch-sequence-serverless-model-lambda:live` health returns `ok`
- deploy `PitchSequenceServerlessStack` pointing at the new model alias
- verify deployed `/ready`
- run `BASE_URL=<serverless-url> npm run verify:product`
- confirm the old App Runner service is not in the product request path
