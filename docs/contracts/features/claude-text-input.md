# Claude text input and settlement

- Status: Approved for implementation; pending verification and review.

## Goal

Add generic text submission to the built-in Claude adapter using its existing stream-json process and lifetime decoder. The daemon input ID remains local and exact; only a correlated root user replay confirms delivery.

## Scenarios

- Advertise only `input.submit` for Claude (`claude-code`, alias `claude`); retain explicit unsupported images and cancellation.
- Resume an exact Claude checkpoint before one text dispatch. Preserve existing no-prompt startup, native UUID validation, and missing-transcript failure.
- Settle only the one active root input from authoritative exact-content user replay and its terminal result. Errors before acceptance are definitely rejected only with explicit protocol proof; ambiguous delivery is uncertain and never retried.
- Stop closes admission synchronously; child exit confirmation remains required for successful stop. Dead, malformed, mismatched, nested, stale, or late records cannot publish/settle input.
- Never log, persist, or forward prompt, reasoning, raw error, or rich assistant output. Fail unsupported interactive requests closed.

## Non-goals

Images, cancellation, callbacks/broker integration, tool execution/approval, model/options/effort/control/reload/commands, public API/DB/v1 changes, output forwarding, and core Claude-specific logic.

## Affected surfaces

[input runtime](../surfaces/input-runtime.md), [harness adapters](../surfaces/harness-adapters.md), [session lifecycle](../surfaces/session-lifecycle.md), [control plane](../surfaces/control-plane.md), [persistence](../surfaces/persistence.md), [API v1](../surfaces/api-v1.md), [API v2](../surfaces/api-v2.md), [bridge events](../surfaces/bridge-events.md), [bridge](../surfaces/bridge-v2.md).

## Constraints and acceptance

Use the existing stdout decoder for initialization and lifetime events. Preserve decoder state, timers, and error listeners through correlated initialization acknowledgement. Submit exact text as one stream-json user message; daemon ID stays local and is not translated to a native UUID. Single-active, exact-content replay is the ACK assumption; do not fabricate acknowledgement from write callback or optional native IDs. A successful terminal result completes only after matching ACK; an errored result safely fails without inventing a reason. Stale generations and terminal outcomes are fenced.

Tests cover initialization/handover, exact wire and root ACK guards, successful/failed outcomes, ambiguous/write errors/timeouts, ordering and stale events, stop/resume, malformed/dead channels, bounds, unsupported inputs, and manager/tracked/builtin behavior with controlled processes only.

## Validation

Run focused tests and all repository gates: tests, typecheck, build, lint, format, version, production audit, pack dry-run, diff checks, authored-file line counts, and v1 regression. Update affected durable surface contracts after verification; retain this feature contract marked pending final review.
