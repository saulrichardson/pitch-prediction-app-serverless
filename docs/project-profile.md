# Project Profile

Project: Pitch Prediction App

A high-integrity software project developed with autonomous coding agents.

## Template Source

This project was generated with Copier from the reusable high-integrity
agentic engineering template.

The durable template metadata is stored in `.copier-answers.yml`. Do not edit
that file manually unless the template repository moves and `_src_path` must be
updated.

The current project stack is defined in this file and ADR 0002. Template
metadata may still reflect the original generation answers and is not the source
of truth for current implementation choices.

## Product Domain

- primary domain: Baseball

## Primary Users

- baseball analyst
- coach or decision maker looking for a next-pitch read
- technical evaluator
- product reviewer exploring model behavior

## Tenant Model

- tenant boundary: anonymous workspace/session cookie
- ownership model: replay timelines are scoped to the workspace cookie
- cross-tenant access rule: no workspace may read another workspace's timelines

## Data Sensitivity

- sensitive data classes: session secret, model API key, database credentials
- data that must never enter client code, logs, or broad tools: AWS secrets,
  model API key, database connection strings
- retention constraints: public MLB data can be cached; session data may be
  deleted when demo storage is reset

## Selected Stack

- frontend web: Next.js App Router + React + TypeScript
- mobile: none in v1; mobile app implementation is a non-goal
- backend/API: Next.js API routes + Node.js + TypeScript
- model service: separate FastAPI/Python inference boundary; local/dev can run
  it as HTTP, and the current AWS demo invokes it as a Lambda container
- durable database: DynamoDB for the deployed serverless demo; PostgreSQL
  support remains in the codebase through Drizzle for future SQL-backed durable
  mode
- data access: explicit storage adapters for memory, DynamoDB, and PostgreSQL
- cloud target: AWS CloudFront -> Lambda Web Adapter -> DynamoDB for the web/API
  path; dedicated AWS Lambda container stack for model inference; Secrets
  Manager, ECR with lifecycle retention, and CDK
- background work: none in v1; add jobs or workflow runtime only when required
- authorization: signed anonymous workspace session boundary
- testing: Vitest, Playwright, API/domain tests, and integration checks where useful
- observability: structured logs, cloud logs/metrics, traces where available,
  and audit events for important actions
- CI/CD: GitHub Actions or equivalent with lockfiles and repeatable builds
- advanced verification: optional; use property tests, model-based tests,
  lightweight specs, or formal methods only when justified by critical
  invariants

## Preferred Implementation Stack

Coding agents should treat this as the project-local preferred language and tool
profile for production code.

- frontend web code: Next.js App Router + React + TypeScript
- backend/API code: Next.js API routes + Node.js + TypeScript
- model service code: FastAPI/Python runtime with HTTP and Lambda handlers,
  isolated from the web container
- persistence and migrations: DynamoDB in deployed serverless mode; PostgreSQL with
  Drizzle ORM and migrations when SQL durable mode is enabled; explicit memory
  storage only for local development
- data access: typed storage adapters around memory, DynamoDB, and Drizzle
- background work: none by default; add jobs, schedulers, or workflow runtime
  only for long-running or retryable work
- authorization and policy: signed anonymous workspace session checks and
  explicit server-side ownership checks
- testing: Vitest, Playwright, API/domain tests, and integration checks where
  useful
- observability: structured logging, cloud logs/metrics, traces where
  available, and audit events for important actions
- CI/CD: GitHub Actions or equivalent with package lockfiles and repeatable
  build steps
- repository automation: POSIX shell or project-selected JavaScript/TypeScript
  scripts when they fit the toolchain better

The previous purity-oriented stack remains useful as design inspiration, but it
is not the prescribed implementation stack for this job-aligned profile.
Preserve the principles, not the exact tools.

If the preferred stack is insufficient, choose the next best option that
accomplishes the goal while preserving typed boundaries, explicit authority,
durable state, controlled side effects, testable behavior, observable
execution, and maintainable code for the team. Record the choice here or in an
ADR, including the boundary it owns, why the selected mainstream stack was not
enough, test and deployment expectations, and the maintenance owner.

## Local Doctrine Overrides

None yet.

When a project-specific decision intentionally overrides the reusable doctrine,
record it here briefly and add an ADR under `docs/adr/`.

## Project-Specific Constraints

- AWS is the cloud provider for the first deployed version.
- The pitch model is a separate model boundary. The deployed demo invokes the
  serverless-native model Lambda through server-side IAM permissions; local
  development can still use the HTTP FastAPI service.
- Public MLB data powers real game replay.
- The deployed app uses anonymous workspace sessions, not a password gate or
  individual user accounts.
- Predictions require the real model service. If the model is not configured,
  unhealthy, or returns malformed output, prediction flows must fail visibly
  instead of returning substitute values.
- Storage mode is explicit and required. Deployed serverless stacks use
  `STORAGE_MODE=dynamodb` with `DYNAMODB_TABLE_NAME`. Use
  `STORAGE_MODE=postgres` only when durable PostgreSQL persistence is required;
  `postgres` mode must have `DATABASE_URL` or `DATABASE_SECRET_JSON`.
- Local memory storage is not durable persistence. It is acceptable for local
  development only. Serverless deployments must not rely on process memory for
  timeline state.

## Approval Model

- actions requiring approval: production AWS deploys and secret changes
- approval actor: repository owner or AWS account owner
- approval expiration: deploy approval is per workflow run
- denial behavior: deployment or secret change does not proceed

## External Systems

| System | Purpose | Data shared | Side effects | Owner |
| --- | --- | --- | --- | --- |
| MLB Stats API | real game schedule and pitch feed | public game and pitch data | read/cache only | MLB |
| Pitch model service | next-pitch prediction | typed pitch moment request | read/predict only | model service owner |
| AWS CloudFront | web entry point | browser HTTP requests | routes to Lambda Function URL | project |
| AWS Lambda | model inference and serverless web hosting | web/model containers and prediction requests | serves web app and invokes model runtime through `PitchSequenceServerlessStack` and `PitchSequenceModelStack` | project |
| AWS DynamoDB | serverless app state | games, timelines, predictions, audit events | pay-per-request data writes | project |
| PostgreSQL durable mode | optional durable app data store | games, timelines, predictions, audit events | database writes when enabled | project |
| AWS Secrets Manager | runtime secrets | session/model/db secrets | secret reads | project |

## Irreversible Actions

- deleting production database snapshots or durable state tables
- rotating production secrets without preserving replacement values
- reintroducing or replacing the durable database

## Critical Invariants

- Actual replay must not reveal actual pitch fields before `Reveal Actual`.
- Timeline API routes must scope reads and writes to the signed anonymous
  workspace session.
- Model output is prediction data, not authority over state transitions.

## First Vertical Slice

Define the first runnable product slice here before adding application code.

```text
React cockpit intent -> typed API command -> domain transition -> timeline record -> observable result
```

First slice:

```text
load latest Mets game
create actual replay timeline
show prediction before pitch reveal
use one primary game-step control to reveal and evaluate actual pitch
use the same control to advance to the next pitch prediction
```

## Known Non-Goals

- hosting model weights inside the web/API app
- counterfactual scenario analysis in the primary in-game prediction UI
- manual current-situation controls in the primary in-game prediction UI
- full batted-ball simulation
- individual user accounts
- multi-user collaboration
- mobile app implementation

## Open Questions

- Should old retained database snapshots be deleted after confirming no demo
  data needs to be restored?
- What retention policy should be used for demo session data?
