# API v2 duplex bridge

## Boundary

`/api/v2/bridge` is the strict text-JSON WebSocket for live events, callback routing and guarded controls. Every client/server frame has `apiVersion:"v2"`; unknown fields reject. Binary, invalid UTF-8, malformed or oversized frames close only that connection. Exact DTOs are in [bridge messages](bridge-messages.md) and [bridge events](bridge-events.md); HTTP is in [API v2](api-v2.md).

## Handshake and ordering

Server sends `server.hello`, client sends `client.open`, and receives a request-correlated open acknowledgement before snapshot frames. Unknown protocol revision/family is an explicit incompatibility. Frame schemas and required fields are defined in [bridge messages](bridge-messages.md).

Selection contexts are connection-bound and may coexist. Generations strictly increase. A selection change completes only after `guard.set` acknowledgement. The adapter checks the current guard at the actual write boundary; invalidate processing never waits on RPC completion. Disconnect invalidates every guard: pre-write rejects, post-write is uncertain and never replayed.

## Callback lease

`callback.bind` creates an exclusive, session-scoped lease to one live connection; `callback.unbind` releases it. A second live binding conflicts and cannot steal. Lease is ephemeral routing, not auth or process/session ownership. It survives process replacement while connected, ends at disconnect/shutdown, and pending callbacks are not reassigned or replayed. Disconnect detaches only; it does not stop daemon sessions/processes. No lease fails permissions closed and makes file-send unavailable; observers cannot answer another client's callbacks.

Callback response validation checks connection, binding, kind, current session/input, pending state and deadline. Wrong-connection, duplicate and late results have no effect. Exact callback envelopes and typed safe failures are in [bridge messages](bridge-messages.md). Permission deadline 60 s (Telegram UI <=55 s); disconnect/timeout denies. File overall deadline 300 s, existing 120 s per-recipient upload; partial delivery is retained and post-dispatch loss is uncertain. Callback payload is bound-client-only.

## Snapshot, reconnect, and bounds

Snapshot is begin, zero or more session records, then end. Committed state and events share an ordered barrier; no live event is allowed inside the snapshot. Queue overflow disconnects, never silently drops. Sequence is monotonic safe integer per `instanceId`, not a durable cursor; no replay/history/exactly-once guarantee. Reconnect gets a new handshake/snapshot/lease/guards and never repeats mutations or callbacks. WS loss means observation gap/uncertain outcome, not a fabricated terminal input event. Exact event/snapshot DTOs are in [bridge events](bridge-events.md).

WS frame max 1 MiB, outgoing queue/buffer max 4 MiB. Permission input <=32 KiB, tool name <=128 chars, context strings <=512 chars, suggestions <=8. File path <=4096/no NUL, caption <=1024 code points; file safety and 20 MiB attachment limit are enforced by the bound client. See [adapter schemas](harness-adapters.md), [persistence](persistence.md).
