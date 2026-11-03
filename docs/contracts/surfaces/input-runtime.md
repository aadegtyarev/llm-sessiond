# Generic input runtime foundation

## Boundary and ownership

The durable session manager owns transient input admission and normalized input-state observation. An execution may optionally expose a generic input port; lifecycle-only executions remain valid. Harness descriptors advertise input capabilities independently and honestly. Pi v2 exposes text and image input; Claude v2 exposes text-only input.

## Admission and outcomes

Input DTOs accept exact text and optional image `{mimeType,data}` records. Text is limited to 256 KiB UTF-8; canonical base64 images total at most 20 MiB decoded. Values are not normalized or truncated. IDs are daemon-generated, exact opaque strings in the existing 1–128 character grammar. Invalid values and unsupported capabilities fail before resume or command dispatch. One unresolved input per session is admitted at a time.

Executions return accepted, definite submit rejection with one of `prompt_rejected|hold_timeout|held_and_stopped|canceled`, or uncertain. A failed terminal input event may omit its reason; any supplied reason remains whitelisted. Cancellation separately reports abort accepted, definitely rejected, or uncertain; definite rejection does not invent an input failure reason. Exceptions, timeouts, and ambiguous outcomes are uncertain and never retried. Stopped sessions resume their exact checkpoint once before a single dispatch. Pi v2 exposes text/images and exact/current cancellation through its lifecycle execution; correlated prompt/abort replies classify commands, while only live `agent_settled` settles the input. Successful abort acknowledgement is not terminal completion; confirmed abort plus settlement emits failed/canceled. Claude v2 sends one native stream-json user message and accepts only a matching root user replay before its result; the daemon input ID stays local. Delivery timeout/write ambiguity is uncertain and never replayed. Input state and bodies are not persisted; restart does not replay work.

## Runtime events and cancellation

The manager exposes `inputs.submit`, exact `inputs.cancel`, `inputs.cancelCurrent`, and `inputs.subscribe`. Events contain only session ID, input ID, normalized state (`pending|accepted|completed|failed|uncertain`), and optional whitelisted failure reason. The execution event port may also report normalized `execution-ended`; unresolved input then becomes uncertain. Exact source and input identity fence stale events. Observer exceptions detach that observer only. Pending/accepted work becomes uncertain when stopped; confirmed stop releases the transient admission slot. Cancellation targets only an accepted exact current input; the adapter refuses abort if settlement was already observed, and a successful abort ACK prevents further abort writes for that input. Acknowledgement alone does not assert terminal completion.

## Session observation

The durable manager exposes internal `events.subscribe(listener)` (no replay) and synchronous `events.snapshot()`. Snapshot returns `{afterRevision,sessions}`; revisions are ephemeral domain commit ordinals, not persisted or transport cursors. Session views whitelist `id,harnessId,cwd,status,name?,nativeSessionId?,adapterOptions?,failureReason?,failedAt?`; adapter state, creation time, ownership and process data are excluded. Ordered records cover committed `session.changed`, `session.deleted`, session-scoped output text, and every normalized input state with its exact opaque input ID. The snapshot is owner-fenced and fails rather than returning an inconsistent boundary. Observer callbacks are isolated and run outside lifecycle locks.

## Limits and non-goals

This is an internal backend foundation, not HTTP or WebSocket wiring. Pi v2 advertises text, image, exact cancellation, current cancellation, and read-only status/usage. A live status query uses the execution's existing serialized RPC reader and may run while input is active; it does not alter input admission or settlement. Claude v2 advertises only `input.submit`; images and cancellation remain unsupported. Other built-in adapters remain lifecycle-only. No prompt/history persistence, input replay after uncertainty, rich harness activity mapping, raw adapter errors, or cross-session input routing is provided.

Related contracts: [control plane](control-plane.md), [adapter registry](harness-adapters.md), [persistence](persistence.md), [session lifecycle](session-lifecycle.md), [API v1](api-v1.md), [API v2](api-v2.md), [bridge](bridge-v2.md), [bridge events](bridge-events.md), and [bridge messages](bridge-messages.md).
