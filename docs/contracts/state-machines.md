# State Machine Contracts

Use this file to record important project lifecycles. Do not let important
statuses become strings assigned from arbitrary code.

For each state machine, record the owner module, states, events, valid and
invalid transitions, guards, terminal states, audit events, and retry or
cancellation behavior where relevant.

## Pitch Replay Timeline

Owner module: `packages/domain/src/timeline.ts`

States:

- `actual_hidden`: current actual pitch is not revealed; prediction is visible
- `actual_revealed`: current actual pitch and evaluation are visible
- `completed`: final actual pitch has been revealed and committed to history

Events:

- `RevealActual`
- `AdvanceActual`
- `StepBackActual`

Rules:

- `RevealActual` is valid only when the current pitch exists and actual fields
  are hidden from the browser.
- `AdvanceActual` is valid only after `RevealActual`.
- `AdvanceActual` commits the revealed pitch and its pre-pitch forecast to
  actual history before requesting the next prediction.
- Repeated `AdvanceActual` at the final pitch is idempotent for history and
  forecast records.
- `StepBackActual` from `actual_revealed` hides the current actual pitch again.
- `StepBackActual` from `actual_hidden` returns to the previous revealed pitch.

Terminal states:

- The timeline is completed when the final actual pitch has been revealed and
  committed to history.

Audit events:

- `timeline.created`
- `timeline.revealed`
- `timeline.advanced`
- `timeline.stepped_back`

Verification:

- valid reveal, advance, final advance, and back-step transitions are covered
  by domain tests
- advancing before reveal is rejected
- unrevealed actual pitch fields are redacted from browser DTOs

## Timeline Start Job

Owner modules:

- `apps/web/src/lib/timeline-job-service.ts`
- `packages/db/src/storage/*`

States:

- `pending`: durable request exists, but no worker lease has been claimed
- `running`: one worker owns a storage-level lease and may call the model
- `succeeded`: first replay timeline has been created and linked
- `failed`: preparation reached a terminal visible failure

Events:

- `CreateTimelineStartJob`
- `ClaimTimelineStartJob`
- `CompleteTimelineStartJob`
- `FailTimelineStartJob`
- `RedispatchExpiredTimelineStartJob`

Rules:

- `CreateTimelineStartJob` writes `pending` before dispatching background work.
- `ClaimTimelineStartJob` is a storage-level conditional transition from
  `pending -> running` or from `running -> running` only when the previous
  lease has expired.
- A running job has `leaseToken` and `leaseExpiresAt` fields. The lease token is
  internal and is not exposed in browser DTOs.
- Completion or failure may update the job only when the current durable
  `leaseToken` matches the worker's token.
- Polling reads may re-dispatch a `running` job whose lease has expired.
- A worker retry that sees `running` without an expired lease must not call the
  model path again.
- The legacy synchronous `POST /api/timelines` start endpoint is retired; callers
  must use `POST /api/timeline-jobs`.

Terminal states:

- `succeeded`
- `failed`

Audit events:

- `timeline_start_job.created`
- `timeline_start_job.dispatch_failed`
- `timeline_start_job.running`
- `timeline_start_job.redispatched`
- `timeline_start_job.succeeded`
- `timeline_start_job.failed`

Verification:

- storage tests cover single-claim behavior, expired lease reclaiming, and
  lease-checked completion
- service tests cover active-lease retry behavior and stale-job redispatch
- frontend polling tests cover terminal 401/404 handling and repeated 5xx
  failure handling
