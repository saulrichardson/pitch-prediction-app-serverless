# Pitch Prediction App

[Live demo](https://baseball.saulrichardson.io) | [Model on Hugging Face](https://huggingface.co/baseball-analytica/pitchpredict-xlstm)

Pitch Prediction App is a serverless MLB next-pitch prediction cockpit.

It does one thing: replay a real game pitch by pitch and show what the model
expected before each pitch was thrown.

The main question is:

```text
Given the pitcher, batter, count, bases, inning, score, and recent pitch
sequence, what is most likely to happen on the next pitch?
```

The demo defaults to the latest Mets game available from public MLB data. It is
designed for a baseball manager, analyst, or technical reviewer who wants to see
whether a model can produce interpretable, game-state-aware reads without
exposing raw ML plumbing.

## The Product Loop

The app is intentionally centered on one repeated workflow.

1. Start the Mets replay.
2. See the model's pre-pitch read before the actual pitch is shown.
3. Reveal the actual pitch.
4. Compare forecast vs actual: pitch type, probability, location, result,
   velocity, and resulting game state.
5. Advance to the next pitch.
6. The actual pitch becomes part of the sequence history, and the model produces
   the next read.

That loop turns a historical game into a live-feeling prediction exercise:

```text
current game state
  -> model next-pitch read
  -> actual pitch reveal
  -> model-vs-actual check
  -> updated game state
  -> next model read
```

The interface is not trying to be a full scouting platform, a counterfactual
simulator, or a generic machine-learning dashboard. Those ideas may be useful
later, but the current product is focused on the in-game next-pitch read.

## What The App Shows

The cockpit is organized around the information a manager needs quickly:

- matchup: pitcher, batter, handedness, inning, count, outs, bases, and score
- pre-pitch read: most likely pitch, pitch mix, likely location, likely result,
  and next-count pressure
- forecast vs actual: what the model expected, what was thrown, how plausible it
  was, and how far the location/velocity missed the model read
- current at-bat sequence: how this plate appearance reached the current count
- pitcher pattern: recent pitch behavior before the current plate appearance
- model detail: the fuller distribution for pitch mix, result forecast, count
  impact, location density, and plate-appearance direction

Actual pitch details are not sent to the browser before they are revealed. The
server returns a browser-safe timeline shape, then exposes actual pitch fields
only after the reveal action.

## How It Works

At a high level, the system has four boundaries.

```text
MLB public data
  -> normalized replay timeline
  -> web/API product state
  -> model inference service
  -> prediction view model
```

The web app owns product behavior:

- loading and normalizing public MLB game data
- creating the replay timeline
- advancing through pitches
- applying baseball state transitions
- shaping browser-safe timeline responses
- rendering the manager cockpit

The model service owns model behavior:

- loading the pitch prediction model
- translating a pitch moment into model inputs
- running inference
- returning product-ready prediction data
- reporting readiness and errors clearly

The browser never calls the model directly. All model calls happen server-side.
Production does not silently fall back to mock predictions. If the real model is
not reachable or returns invalid data, the app should report that failure rather
than pretend a prediction exists.

## System Shape

The canonical demo is a cost-conscious AWS serverless deployment:

- frontend and API: Next.js App Router, React, TypeScript, and Next.js API routes
- web runtime: Next.js standalone server running in AWS Lambda through Lambda Web Adapter
- model runtime: separate Python/FastAPI model service deployed as an AWS Lambda container
- model ownership: dedicated `PitchSequenceModelStack` with a warmed `live` alias
- state: DynamoDB for deployed demo storage
- secrets: AWS Secrets Manager
- packaging: Amazon ECR container images
- delivery: CloudFront in front of the web Lambda
- infrastructure: AWS CDK in TypeScript
- verification: Vitest, pytest, Playwright, product-flow checks, and GitHub Actions

PostgreSQL support remains in the codebase through the storage boundary, but the
current public demo uses DynamoDB to avoid standing RDS, VPC, and NAT costs.

## Where To Look First

Start with the product path before reading infrastructure.

- UI cockpit:
  [`apps/web/src/components/pitch-sequence-lab.tsx`](apps/web/src/components/pitch-sequence-lab.tsx)
  and [`apps/web/src/components/pitch-sequence-lab/`](apps/web/src/components/pitch-sequence-lab/)
- API routes:
  [`apps/web/src/app/api/`](apps/web/src/app/api/)
- timeline commands:
  [`apps/web/src/lib/timeline-service.ts`](apps/web/src/lib/timeline-service.ts)
- browser-safe response shaping:
  [`apps/web/src/lib/timeline-dto.ts`](apps/web/src/lib/timeline-dto.ts)
- model adapter:
  [`apps/web/src/lib/model-service.ts`](apps/web/src/lib/model-service.ts)
- MLB ingestion and normalization:
  [`apps/web/src/lib/mlb-service.ts`](apps/web/src/lib/mlb-service.ts)
  and [`packages/domain/src/mlb.ts`](packages/domain/src/mlb.ts)
- replay/domain rules:
  [`packages/domain/src/timeline.ts`](packages/domain/src/timeline.ts)
  and [`packages/domain/src/state.ts`](packages/domain/src/state.ts)
- model service:
  [`services/model-api/`](services/model-api/)
- storage adapters:
  [`packages/db/`](packages/db/)
- AWS infrastructure:
  [`infra/`](infra/)
- product verification:
  [`scripts/verify-product-flows.mjs`](scripts/verify-product-flows.mjs)
  and [`tests/e2e/`](tests/e2e/)

## Engineering Docs That Guided The Build

The codebase was built from an agentic engineering documentation set. The docs
matter because the app has multiple trust boundaries: public MLB data, server
state, model output, browser-visible UI, and AWS deployment.

Read these first:

- [`docs/product-intent.md`](docs/product-intent.md) explains the product focus:
  an in-game next-pitch predictor, not a broad simulator.
- [`docs/project-profile.md`](docs/project-profile.md) records the selected
  stack, current deployment shape, non-goals, and critical invariants.
- [`docs/adr/0005-refocus-primary-ui-on-next-pitch-prediction.md`](docs/adr/0005-refocus-primary-ui-on-next-pitch-prediction.md)
  explains why branching and manual scenario controls were moved out of the
  primary UI.
- [`docs/adr/0008-adopt-serverless-web-architecture.md`](docs/adr/0008-adopt-serverless-web-architecture.md)
  explains the serverless AWS architecture and why it replaced the earlier
  standing App Runner/RDS approach for the canonical demo.
- [`docs/adr/0012-adopt-serverless-model-stack.md`](docs/adr/0012-adopt-serverless-model-stack.md)
  explains the final model ownership transition that makes App Runner only a
  temporary redirect during shutdown.
- [`docs/contracts/model-service.md`](docs/contracts/model-service.md) defines
  the boundary between product state and model inference.
- [`docs/contracts/state-machines.md`](docs/contracts/state-machines.md) defines
  the replay lifecycle and state transition expectations.
- [`docs/engineering/doctrine.md`](docs/engineering/doctrine.md) is the
  operating philosophy: explicit state, typed boundaries, controlled side
  effects, observable behavior, and reviewable agent-generated changes.

The short version: model output is prediction data, not authority; actual game
state changes go through explicit domain transitions; and the browser only gets
data it is allowed to show.

## Run Locally

Install dependencies:

```bash
npm ci
```

Run the web app:

```bash
npm run dev
```

The product expects a real model service for predictions. Local UI work may use
local infrastructure, but production behavior must not return mock predictions
as if they were real model output.

Useful checks:

```bash
npm run typecheck
npm test
npm run test:model
npm run lint
npm run build
```

Verify the deployed product flow:

```bash
BASE_URL=https://baseball.saulrichardson.io npm run verify:product
```

## Current Non-Goals

These are deliberately outside the primary v1 experience:

- counterfactual branching in the main cockpit
- manual situation entry in the main cockpit
- individual user accounts
- mobile app development
- full batted-ball simulation
- hosting model internals inside the web/API process

The product should stay focused until the next-pitch replay loop is clearly
useful, reliable, and easy to explain.
