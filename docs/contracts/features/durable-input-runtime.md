# Durable input runtime foundation

- Status: Approved, pending independent review
- Date: 2026-11-09

## Goal and behavior

Implement transport-neutral in-memory input admission, coordination, and execution input/event ports for durable sessions. Preserve lifecycle-only executions and forward optional input ports through wrappers. The manager assigns opaque authoritative IDs, validates content and capability before side effects, reports normalized input states, handles exact cancellation, and fences stale events/commands. Inputs are never persisted or replayed.

## Scenarios

- Submit text and optional canonical-base64 images within API v2 limits; reject unsupported capabilities and invalid data before resume or dispatch.
- Running sessions admit one input. Stopped sessions resume the exact checkpoint once and dispatch once. Definite rejection, unknown outcomes, ACK timeout, early settlement, stop, and late results remain safe and never replay.
- Cancel only the exact accepted current input; resolve cancel-current at dispatch. Reject mismatches, pending/uncertain/canceling work, and unsupported operations before writes.
- Runtime observers receive normalized states; listener failures and stale/malformed events cannot affect execution or unrelated inputs. Stop, shutdown, or normalized execution-ended progress marks unresolved input uncertain while input commands are gated.

## Non-goals

No Pi/Claude input implementation, HTTP/WS transport, v1 changes, schema/history/prompt persistence, process protocol, rich activity mapping, or client/API/bridge changes. Built-in capability declarations remain unchanged.

## Affected surfaces

- [Control plane](../surfaces/control-plane.md)
- [Harness adapters](../surfaces/harness-adapters.md)
- [Persistence](../surfaces/persistence.md)
- [Session lifecycle](../surfaces/session-lifecycle.md)
- [API v1](../surfaces/api-v1.md) (compatibility only)
- [API v2](../surfaces/api-v2.md)
- [Duplex bridge](../surfaces/bridge-v2.md)
- [Bridge events](../surfaces/bridge-events.md)
- [Bridge messages](../surfaces/bridge-messages.md)

## Interfaces and constraints

The execution input port is optional and generic. It accepts daemon-generated input IDs and exact text/image values, and returns accepted, definite rejection with whitelisted safe failure data, or uncertain outcomes. Exceptions, timeout, and write ambiguity are uncertain. Event inputs are runtime-validated, normalized, source-generation and exact-ID fenced. No raw adapter error, callback closure, process handle, or signal enters public DTOs or persistence.

Text is at most 256 KiB UTF-8; images at most 20 MiB aggregate decoded canonical base64. IDs use `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`; the daemon allocates and collision-checks IDs. Input state is transient, one unresolved operation per session, and no operation is retried. Admission lock is released before awaiting command settlement; dispatch itself is serialized against lifecycle operations.

## Acceptance and validation

Synthetic third-harness tests cover validation/capabilities before side effects, IDs/collisions, accepted/rejected/uncertain/timeout/early settlement, no-replay, cancellation races, auto-resume failure semantics, lifecycle progress, stale/malformed events, observer isolation, restart behavior, and wrapper forwarding. Run Node 24 tests, typecheck, build, lint, format, version, audit, package, diff/line-count checks, and v1 regression. Independent review required; contract remains pending review.
