# Generic input runtime foundation

## Boundary and ownership

The durable session manager owns transient input admission and normalized input-state observation. An execution may optionally expose a generic input port; lifecycle-only executions remain valid. Harness descriptors advertise input capabilities independently and honestly. Built-in Pi and Claude executions are not input-wired in this foundation.

## Admission and outcomes

Input DTOs accept exact text and optional image `{mimeType,data}` records. Text is limited to 256 KiB UTF-8; canonical base64 images total at most 20 MiB decoded. Values are not normalized or truncated. IDs are daemon-generated, exact opaque strings in the existing 1–128 character grammar. Invalid values and unsupported capabilities fail before resume or command dispatch. One unresolved input per session is admitted at a time.

Executions return accepted, definite rejection with one of `prompt_rejected|hold_timeout|held_and_stopped|canceled`, or uncertain. Exceptions, timeouts, and ambiguous outcomes are uncertain and never retried. Stopped sessions resume their exact checkpoint once before a single dispatch. Input state and bodies are not persisted; restart does not replay work.

## Runtime events and cancellation

The manager exposes `inputs.submit`, exact `inputs.cancel`, `inputs.cancelCurrent`, and `inputs.subscribe`. Events contain only session ID, input ID, normalized state (`pending|accepted|completed|failed|uncertain`), and optional whitelisted failure reason. The execution event port may also report normalized `execution-ended`; unresolved input then becomes uncertain. Exact source and input identity fence stale events. Observer exceptions detach that observer only. Pending/accepted work becomes uncertain when stopped; confirmed stop releases the transient admission slot. Cancellation targets only an accepted exact current input; acknowledgement alone does not assert terminal completion.

## Limits and non-goals

This is an internal backend foundation, not HTTP or WebSocket wiring. Built-in adapters currently remain lifecycle-only, so input operations are unsupported for them. No prompt/history persistence, input replay, rich harness activity mapping, raw adapter errors, or cross-session input routing is provided.

Related contracts: [control plane](control-plane.md), [adapter registry](harness-adapters.md), [persistence](persistence.md), [session lifecycle](session-lifecycle.md), [API v1](api-v1.md), [API v2](api-v2.md), [bridge](bridge-v2.md), [bridge events](bridge-events.md), and [bridge messages](bridge-messages.md).
