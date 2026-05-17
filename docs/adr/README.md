# Architecture Decision Records

Use ADRs for decisions that future developers or agents might reasonably
question.

Good ADR subjects:

- choosing or replacing a core technology
- adding a language, framework, runtime, package manager, database, queue,
  workflow engine, policy engine, or cloud service
- changing a state machine
- introducing a new side-effect boundary
- exposing a new product-facing side-effect capability
- changing policy or approval behavior
- changing persistence ownership or constraints
- changing deployment or infrastructure strategy
- accepting a meaningful security or reliability tradeoff

ADRs should be short. A decision that needs a long essay usually needs a clearer
problem statement.

Use `docs/templates/adr.md` as the starting point.

## Current ADRs

- `0001-adopt-agentic-engineering-doctrine.md`: adopts the high-integrity
  agentic engineering doctrine.
- `0002-adopt-job-aligned-typescript-stack.md`: sets the current practical
  implementation stack for this project.
- `0004-adopt-separate-pitchpredict-model-service.md`: separates real
  PitchPredict inference from the web app behind a stable product contract.
- `0005-refocus-primary-ui-on-next-pitch-prediction.md`: archives
  counterfactual branching as a primary UI concern and makes next-pitch
  prediction the v1 product focus.
- `0006-remove-password-gate-and-mock-predictions.md`: removes the
  shared-password barrier and requires real model predictions.
- `0008-adopt-serverless-web-architecture.md`: selects the
  CloudFront/Lambda Web Adapter/DynamoDB deployment for this serverless repo.
- `0009-remove-archived-scenario-api-surface.md`: removes branch/manual
  scenario behavior from the active v1 web/API/domain surface.
- `0010-use-warmed-model-lambda-alias.md`: routes production model invokes to a
  warmed `live` Lambda alias with provisioned concurrency.
- `0011-adopt-async-timeline-start-jobs.md`: creates replay timelines through a
  durable async start job so public cold starts show a waiting state instead of
  timing out behind CloudFront.
- `0012-adopt-serverless-model-stack.md`: gives the model Lambda its own
  serverless-native stack so the old App Runner-era stack can be retired.
