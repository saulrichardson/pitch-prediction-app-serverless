# Side-Effect Capability Registry

Register side-effect boundaries here when another module depends on their
contract. This project does not expose product-agent tools in v1.

Broad capabilities such as arbitrary SQL, shell execution, arbitrary HTTP, or
arbitrary file write require an ADR before they become a product or automation
boundary.

## Registry

| Capability | Purpose | Input type | Output type | Allowed actors | Policy rule | Approval | Side effect | Idempotency key | Timeout | Audit event | Failure states |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fetchMlbGameReplay` | Load public MLB game data for replay | game id | normalized `GameReplay` plus optional raw payload | server API | public read only | no | external MLB API read | game id | app-configured HTTP timeout | none currently | failed, unavailable, malformed |
| `requestPitchPrediction` | Ask model service for a next-pitch prediction | `PredictionRequest` | `PredictionResponse` | server API | server-side model authority present | no | model service HTTP call or Lambda invoke | prediction request context | app-configured model timeout | `prediction_runs` on success when durable storage is enabled | failed, unavailable, malformed, unauthorized |
| `persistTimeline` | Save replay timeline state | `Timeline` | saved `Timeline` | server API | workspace scoped | no | DynamoDB, PostgreSQL, or local memory write | timeline id | storage timeout | timeline audit event from caller | failed |
| `claimTimelineStartJob` | Claim async replay preparation | job id plus lease token/expiry | claimed `TimelineStartJob` or no claim | internal worker | internal worker secret plus storage condition | no | conditional DynamoDB, PostgreSQL, or local memory write | job id | storage timeout | `timeline_start_job.running` | not found, already claimed, terminal |
| `updateClaimedTimelineStartJob` | Complete or fail async replay preparation | job plus current lease token | updated `TimelineStartJob` or no update | internal worker | current durable lease token must match | no | conditional DynamoDB, PostgreSQL, or local memory write | job id and lease token | storage timeout | `timeline_start_job.succeeded` or `timeline_start_job.failed` | stale lease, already terminal, failed |
| `recordAuditEvent` | Record important timeline behavior | audit event input | stored audit row or memory entry | server API | workspace scoped when present | no | DynamoDB, PostgreSQL, or local memory write | audit event id | storage timeout | event action name | failed |

## Required Capability Fields

For each new capability, define:

- purpose
- typed input
- typed output
- allowed actors
- policy rule
- approval requirement
- side effect
- idempotency behavior
- timeout
- audit event
- failure states

## Rules

- capabilities must be narrow
- external outputs are untrusted input
- capability errors must have typed failure states
- high-risk capabilities require approval or ADR-backed justification
- critical-risk capabilities require a threat model
