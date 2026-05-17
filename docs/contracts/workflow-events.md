# Workflow Event Contracts

This app has no general-purpose durable background workflow runtime in v1.
Timeline replay actions are synchronous API/domain/storage operations. Replay
startup uses a bounded durable `TimelineStartJob` preparation lifecycle because
the first real model prediction may outlive CloudFront's public request timeout.

Use this file when the project introduces a real long-running or retryable
workflow, such as scheduled data ingestion, model batch evaluation, retention
cleanup, or deployment automation that needs durable state.

## Required Fields For Future Workflows

For each workflow event, record:

- workflow name
- event name
- payload type
- idempotency key
- retry behavior
- side effects triggered
- audit or telemetry event
- failure states

## Current Events

Current user-visible replay timeline actions are audit events, not durable
workflow events:

- `timeline.created`
- `timeline.revealed`
- `timeline.advanced`
- `timeline.stepped_back`

See `docs/contracts/telemetry-events.md`.

Timeline startup preparation records these durable lifecycle events:

- `timeline_start_job.created`: job persisted before background dispatch
- `timeline_start_job.dispatch_failed`: initial worker dispatch failed before a
  worker claim was made
- `timeline_start_job.running`: worker claimed the job lease and may call the
  model
- `timeline_start_job.redispatched`: polling observed an expired running lease
  and requested another worker delivery
- `timeline_start_job.succeeded`: first timeline was created by the current
  lease owner
- `timeline_start_job.failed`: current lease owner recorded a terminal visible
  failure

Retry behavior:

- workers claim jobs with a conditional storage transition
- only one active lease may call the model for a job at a time
- stale running jobs are recovered by polling reads that re-dispatch expired
  leases
- completion and failure updates require the current lease token

## Rules For Future Workflows

- workflows should record decisions before side effects
- external callbacks need idempotency keys
- retries must not produce duplicate side effects
- approval waiting states must be visible when approval is required
- cancellation behavior must be explicit
