# API v2 duplex bridge

## Boundary and ordering

`/api/v2/bridge` is a text-JSON duplex WebSocket for live events, callbacks, and guarded controls. Every frame is one strict object with `apiVersion:"v2"`; binary, invalid UTF-8, malformed or oversized JSON closes only that connection. See [API v2](api-v2.md) for HTTP and [control plane](control-plane.md) for semantics.

## Handshake and requests

Server sends `server.hello {protocolRevision:1,instanceId,connectionId}`; client sends `client.open {requestId,protocolRevision:1,callbacks:string[]}`. Requests receive `request.succeeded {requestId,result}` or safe `request.failed {requestId,error}`. Unknown revision/family is explicit incompatibility. Ordered connection frames carry `guard.set {requestId,contextId,generation,sessionId|null}` and `control.request {requestId,sessionId,guard:{contextId,generation},timeoutMs,operation}`. Operations: `reload`; `command.run {name,remainder}`; or registered `extension {namespace,version,name,input}`. `control.cancel {requestId,targetRequestId}` returns `not-dispatched|unknown`; it does not cancel input or undo a possible write.

Generations strictly increase; contexts are connection-bound and may coexist. Null selection invalidates. A selection change completes only after the invalidate acknowledgement. Process invalidate frames without waiting for RPC completion. Adapter rechecks the generic guard at the actual write boundary. Disconnect invalidates all guards: before-write rejects; after-write is uncertain, never replayed.

## Callback routing lease

`callback.bind {requestId,sessionId}` grants an exclusive session-scoped live-connection lease and returns `{bindingId,sessionId}`; `callback.unbind {requestId,bindingId}` releases it. Another live binding conflicts, never steals. Lease is ephemeral routing, not auth or session ownership. It survives process replacement while connected, ends on disconnect/shutdown, and pending callbacks are not reassigned/repeated. Disconnect only detaches; it does not stop the daemon session/process. No lease means permission fails closed and file-send is unavailable. Observers cannot answer a different client's callbacks.

Server-assigned callback IDs correlate `callback.request {callbackId,bindingId,sessionId,deadlineAt,kind,inputId?,payload}` and strict `callback.result {callbackId,bindingId,result}`. Permission result is `{behavior:"allow"}` or `{behavior:"deny",message,interrupt:false}`. File result is `{fileName,delivered,recipients}` with safe integers and `0≤delivered≤recipients`; safe failure carries code and `outcome:not-dispatched|unknown`. The server verifies connection, binding, kind, current session/input, pending state, and deadline; wrong connection, duplicate, and late responses do not change outcome. Permission deadline 60 s (Telegram UI at most 55 s); disconnect/timeout denies; cancel sends `callback.cancel {callbackId,reason}`, late allow ignored. File-send overall deadline 300 s, existing 120 s per-recipient upload; partial delivery retained, lost post-dispatch result is uncertain. Cancellation cannot undo Telegram delivery or transfer lease. File payload is canonical path/caption, not bytes; client enforces canonical-cwd containment, regular file/TOCTOU checks and 20 MiB attachment limit, and revalidates authorized recipients.

## Events and snapshot

Envelope: `{apiVersion:"v2",type:"event",instanceId,sequence,at,event}`. Sequence is monotonic safe integer per instance, not durable cursor. Event families: committed `session.changed {session}`, `session.deleted {sessionId}`, rich `harness.event`, and versioned namespaced extension event. Rich standard projection includes output/status/error/fatal/structured stop; exact input states/failures; thinking/tool summary; summary-only thought/task/agent notice; notification/level/widget; redacted anomaly summary. It excludes journal-only `anomaly.head` and `diagnosticTail`; never carries raw reasoning.

On open: `snapshot.begin {snapshotId,afterSequence}`, zero or more `snapshot.session {snapshotId,session}`, then `snapshot.end {snapshotId}`. A shared committed-state/event ordering barrier ensures post-boundary events follow snapshot end. Bounded-queue overflow disconnects; no silent drop. No history, replay, or exactly-once guarantee. Reconnect gets a new handshake/snapshot/lease/guards; never repeats mutations or callbacks. WS loss marks observation gap/outcome uncertain and does not fabricate terminal input events.

## Privacy and limits

WS frame max 1 MiB; outgoing queue/buffer max 4 MiB; overflow closes connection. Permission payload is bound-client-only; content events may contain workspace data and are not diagnostics. Permission input 32 KiB, tool name 128 chars, context strings 512 chars, suggestions max 8. File path max 4096/no NUL, caption max 1024 code points. Related: [adapter schemas](harness-adapters.md), [persistence/restart](persistence.md).
