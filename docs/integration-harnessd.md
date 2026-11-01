# harnessd integration plan

## Seam mapping (future work; no client changes in this slice)

- `harnessd` `SessionPort.list/get/create/stop/resume` maps to `GET /api/v1/sessions`, `GET /api/v1/sessions/:id`, `POST /api/v1/sessions`, and `POST .../stop|resume`. The API currently supports only `harnessId:"pi"`, `cwd`, and optional `name`; local options/rename/delete do not map and must remain explicit unsupported behavior.
- `InputPort.submit` maps to `POST .../inputs`; preserve API `inputId` for exact `InputPort.cancel(sessionId,inputId)` → `POST .../cancel`. A 409 uncertain delivery must not be retried.
- Harness registry lookup maps to `GET /api/v1/harnesses`; capabilities are explicit. No models/tools/approvals/files endpoints exist.
- Subscribe to `/api/v1/events?sessionId=<id>` and translate versioned `session.status`, `input.state`, `assistant.delta`, `activity`, and `turn.completed` into existing harnessd event types. API event IDs are process-local; clients must not treat them as durable cursor IDs.
- Preserve harnessd's current internal Pi RPC adapter semantics behind the service boundary; the service, not harnessd, owns Pi process lifecycle after migration.

## Phased checklist

1. Inventory each harnessd consumer and record which current methods lack API equivalents; do not emulate missing server capabilities locally.
2. Add a separate API client implementing selected `SessionPort` and `InputPort` operations; keep current ports and native backend behind a rollout switch.
3. Map API errors/statuses and event envelopes, including uncertain/no-retry handling; test disconnect and service restart as loss of ephemeral state.
4. Run parity tests for create/submit/events/cancel/stop/exact resume and concurrent sessions; compare Pi RPC behavior with current adapter tests.
5. Only after explicit migration approval, remove local Pi ownership and ship client changes in the harnessd repository.
