# Pi exact input cancellation

- Status: Pending review
- Scope: one durable Pi cancellation capability seam

## Goal

Advertise and implement Pi cancellation only for the exact currently accepted input. `cancelCurrent` resolves that ID under existing admission synchronization. Acknowledging the native abort is not input settlement.

## Scenarios

- A correlated successful abort waits for live `agent_settled` before publishing failed/canceled.
- Definite abort rejection leaves the original input accepted/current and allows a new explicit retry; ambiguous delivery becomes uncertain and never retries.
- Pending, stale, stopping/dead, uncertain, settled-before-cancel, or already canceling work is never newly aborted. An accepted abort ACK forbids another abort for that input until it ends. Settlement and late responses cannot affect a replacement input or resumed generation.
- Text/image submission and v1 cancellation behavior remain unchanged.

## Non-goals

No transport/API/DB changes, generic cancellation framework, stop-as-cancel, replay, Claude capability, or v1 edits.

## Affected surfaces

[input runtime](../surfaces/input-runtime.md), [harness adapters](../surfaces/harness-adapters.md), [session lifecycle](../surfaces/session-lifecycle.md), [control plane](../surfaces/control-plane.md), [persistence](../surfaces/persistence.md), [API v1](../surfaces/api-v1.md), [API v2](../surfaces/api-v2.md), [bridge events](../surfaces/bridge-events.md).

## Constraints and acceptance

Pi descriptor adds only `input.cancel` and `input.cancel-current`; native abort is one correlated `{id,type:"abort"}` request without an input ID. Cancellation outcomes must distinguish accepted/rejected/uncertain without fabricating submit failure. This uses a narrow internal cancel outcome distinct from submit rejection; stale results remain truthful errors while all state mutation stays current/source-fenced. Preserve generation/source fencing, stop finality, and settlement ordering. Add deterministic direct-port and generic manager regressions for exact targeting, rejection/uncertainty, settlement races, stale results, and unchanged text/images.

## Validation

Run focused cancellation and v1 tests, full Node 24 test/typecheck/build/lint/format/version checks, production audit, package check, diff and authored-file line checks.
