# ADR: Adopt Separate PitchPredict Model Service

- status: accepted
- date: 2026-05-10
- owners: project maintainers

## Context

Pitch Sequence Lab already has the product shell for game replay, branching,
manual situations, timeline comparison, persistence, and anonymous workspace
scoping. The remaining gap is that predictions must come from the real pitch
prediction model through a separate inference service.

The model runtime has different operational needs from the web app: Python
dependencies, PyTorch, Hugging Face model loading, model warmup, independent
readiness, and clearer failure reporting.

## Decision

Run the real pitch prediction model in a separate Python inference boundary.

Use:

- FastAPI for the local HTTP model service boundary
- an AWS Lambda container handler for the cost-optimized deployed demo
- `pitchpredict==0.5.0` as the model package
- the `xlstm` PitchPredict algorithm by default
- CPU PyTorch wheels in the model container
- `GET /health` for HTTP model readiness
- `POST /v1/pitch/predict` for HTTP product-level pitch-moment prediction
- server-side bearer authentication from AWS Secrets Manager for HTTP mode
- IAM-scoped Lambda invocation from the serverless web Lambda role in the
  deployed AWS demo
- a separate ECR repository for the model image

The web app continues to own product behavior: auth, game loading, replay,
branching, manual situations, persistence, and UI. The model service owns model
loading, input preparation, inference, output normalization, readiness, and
model-specific errors.

The boundary remains product-oriented:

```text
Pitch Moment in -> Prediction View Model out
```

The frontend and web API must not depend on raw tensors, model internals, Hugging
Face implementation details, or package-specific response shapes.

## Rationale

Separating the model service prevents Python/model dependencies from entering
the Next.js web container and makes model readiness observable on its own.

Keeping the app-side contract in product terms preserves the ability to replace
or tune the underlying model package later without rewriting the replay,
branching, comparison, or UI flows.

The web app must not maintain a substitute prediction path. If the real model
service is not configured, unhealthy, times out, or returns malformed output,
prediction-producing workflows fail visibly instead of inventing a prediction.

## Consequences

The deployed serverless demo has one web Lambda container plus one model Lambda
container:

- `pitch-sequence-serverless-web`: Next.js web/API app through Lambda Web Adapter
- `pitch-sequence-serverless-model-lambda`: Python model inference Lambda
  container owned by `PitchSequenceModelStack`

The web app calls the model service server-side using either `MODEL_BASE_URL`
and `MODEL_API_KEY` in HTTP mode or `MODEL_LAMBDA_FUNCTION_NAME` in Lambda
mode. Browsers do not call the model service directly and never receive model
service credentials.

Model failures are surfaced as unavailable prediction behavior instead of fake
baseball predictions.

## Verification

- model service unit/contract tests
- local model container build with CPU PyTorch
- local `/health` check reports `pitchpredict-xlstm-v0.5.0`
- local `/v1/pitch/predict` returns a product-ready prediction
- local Lambda handler `health` and `predict` events return product-ready
  responses
- web app model adapter rejects malformed responses and missing model
  configuration
- production product-flow verification asserts real model readiness
