# System Map

This map describes how work moves from intent to durable consequence in the
Pitch Prediction App.

## Development Path

Coding-agent work follows this path:

```text
task intent
  -> repository context
  -> change classification
  -> affected boundary
  -> implementation plan
  -> code or docs change
  -> verification
  -> review evidence
  -> documentation / ADR if needed
  -> deployability check when relevant
```

A change is not complete only because tests pass. It must preserve the relevant
boundary and produce evidence appropriate to the risk.

## Product Runtime Path

The primary product flow is:

```text
user opens cockpit
  -> anonymous workspace session
  -> latest MLB game or selected game replay
  -> timeline creation API
  -> domain timeline state
  -> server-side model prediction request
  -> validated prediction response
  -> timeline persistence and audit event
  -> UI shows prediction before actual reveal
  -> reveal / advance events repeat
```

The model service predicts. The web app decides state transitions.

## Core Boundaries

| Boundary | Owner | Responsibility |
| --- | --- | --- |
| Frontend cockpit | `apps/web/src/components/pitch-sequence-lab.tsx` | Capture replay intent, show prediction/reveal/advance state, surface failures clearly |
| API routes | `apps/web/src/app/api/` | Validate HTTP input, load workspace session, call application services |
| Session boundary | `apps/web/src/lib/auth.ts` | Issue and verify signed anonymous workspace cookies |
| Application services | `apps/web/src/lib/*-service.ts` | Coordinate domain calls, storage, external data, and model service adapters |
| Domain model | `packages/domain/src/` | Own baseball state, prediction request construction, timeline transitions, and evaluation logic |
| Model service boundary | `apps/web/src/lib/model-service.ts`, `services/model-api/` | Call the real pitch model server-side through HTTP or Lambda and reject unavailable or malformed responses |
| Persistence | `packages/db/src/` | Store games, timelines, prediction runs, and audit events through explicit memory, DynamoDB, or PostgreSQL storage modes |
| Infrastructure | `infra/`, `Dockerfile.web-lambda`, service Dockerfiles | Reproduce serverless web hosting, dedicated model Lambda ownership, DynamoDB, Secrets Manager, ECR, and container deployment |

## Current Domain Objects

- `GameReplay`
- `GameSummary`
- `PitchEvent`
- `PredictionRequest`
- `PredictionResponse`
- `Timeline`
- `AuditEvent`

Use these names or add similarly specific names when the product grows. Avoid
hiding important behavior behind generic `data`, `payload`, or `metadata`
unless the generic field is only a serialization container for a typed concept.

## Side Effects

Current side effects are:

- read public MLB game data
- call the server-side pitch model service through HTTP locally or Lambda in AWS
- write local memory demo records, DynamoDB serverless records, or Postgres
  rows when SQL durable mode is enabled
- write audit events
- deploy or mutate AWS resources through CDK

Each side effect should be typed, bounded, timeout-aware where relevant, and
observable enough to explain user-visible behavior.

## Design Smells

- a route handler owns baseball transition logic that belongs in `packages/domain`
- actual pitch data is exposed before the reveal state allows it
- a prediction path returns fake values when the model service is unavailable
- timeline reads or writes skip workspace scoping
- model service credentials are reachable from browser code
- a database migration changes ownership or invariants without an ADR
- an AWS change creates standing cost without being documented
- production behavior cannot be reconstructed from persisted rows, audit events,
  logs, and deployment history
