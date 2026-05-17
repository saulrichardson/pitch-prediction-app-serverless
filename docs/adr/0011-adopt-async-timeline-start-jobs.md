# ADR: Adopt Async Timeline Start Jobs

- status: accepted
- date: 2026-05-14
- owners: project maintainers

## Context

The app is now public-facing rather than only manually demoed. A user may arrive
when the model Lambda is cold or when the single warmed model lane is occupied.
CloudFront gives the web origin a 60 second read timeout, but a cold xLSTM model
environment can take longer than that to download/load the public model and
produce the first prediction.

The product requirement is still that the app uses real model predictions. A
mock or cached substitute prediction would make the first replay look fast but
would violate the core demo.

## Decision

Starting a replay creates a durable `TimelineStartJob` and returns immediately.
The browser shows a real waiting state and polls the job. A background invocation
of the web Lambda runs the actual timeline creation with a longer model timeout.
When the first prediction exists, the job moves to `succeeded` and the browser
opens the normal replay cockpit. If the model cannot finish, the job moves to
`failed` with a stable error code and user-visible retry message.

Workers must claim a job through a conditional storage transition before calling
the model. A running job carries an internal lease token and expiry; completion
or failure is accepted only from the current lease owner. Polling reads may
re-dispatch expired running leases so a worker timeout or process crash does not
leave the browser waiting forever.

The deployed serverless stack keeps CloudFront request behavior short for public
requests, increases only the web Lambda timeout for the internal worker path,
and grants the web Lambda permission to invoke itself asynchronously. Timeline
start jobs are persisted in DynamoDB in deployed mode and in the SQL durable
schema for PostgreSQL mode.

## Rationale

This makes cold starts honest and recoverable. The user sees that the real model
is warming instead of watching a request hang or fail at CloudFront. The existing
`Timeline` domain contract stays clean: a timeline still means there is already
a current prediction. The new job object owns only the preparation lifecycle.

Keeping one provisioned model lane preserves speed for the normal one-off demo,
while reserved model concurrency of two allows one capped cold overflow for
organic public traffic.

## Alternatives Considered

- Keep two provisioned model environments. This improves overlapping starts but
  pays for capacity the project does not need most of the time.
- Let synchronous starts cold-start and rely on retry. That is simpler but
  creates a poor public landing experience because the browser and CloudFront
  cannot distinguish warmup from failure.
- Add a full queue/workflow service. That is more infrastructure than this
  bounded first-prediction preparation flow needs.

## Consequences

The app now has a small asynchronous API surface:

- `POST /api/timeline-jobs`
- `GET /api/timeline-jobs/:id`
- internal `POST /api/timeline-jobs/:id/run`

The internal run route must remain header-protected and must not create user
sessions. Product verification needs to poll job completion instead of assuming
timeline creation is synchronous.

The older synchronous `POST /api/timelines` creation route is intentionally
retired and returns `410 Gone`; public callers must use the async job API.

Later pitch advancement still invokes the model synchronously. That is acceptable
because the first start normally warms the model environment for the session, but
future higher-traffic versions should move all prediction generation behind the
same job/polling pattern or a dedicated queue.

## Verification

- typecheck and unit tests cover the new types and server build
- product-flow verification creates a timeline through the async job endpoint
  and polls until the first real prediction is visible
- deployed `/ready` reports the real model status before product verification
