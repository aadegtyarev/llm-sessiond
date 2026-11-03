# Observable Pi text turn

- Status: Approved
- Scope: approved implementation of the opt-in observable Pi text turn; no production/default-v1 or transport wiring changes outside the specified existing v2 seams.

## Goal and scenarios

Expose a single-session Pi text turn through the existing v2 HTTP input submit and existing `/api/v2/bridge` hello/open/snapshot/live protocol. A built client submits text once; safe assistant text is observed as existing session-scoped `harness.event` output, and every input-state event identifies the exact daemon `inputId`. This slice is opt-in through the existing separate `start:v2` composition; default v1 and production behavior stay unchanged.

The client receives validated snapshot/live frames, submits text, and observes text followed by terminal state for the exact input. Submission `202 {inputId,resumed}` reports a successful submit command result, not model/text completion. It does not assert that an accepted result can never reflect delivery; Claude's existing correlated native delivery acknowledgement is outside this Pi-only scope.

## Interfaces and constraints

- Reuse strict `POST /api/v2/sessions/:sid/inputs {text}` and existing manager admission, exact resume once, limits (24 MiB JSON, 256 KiB UTF-8 text), and no text normalization. Images fail explicitly before effects until separately covered by the wire. Route by generic ports/capabilities, not harness-ID cases. Preserve `resumed:true` if resume occurred even when submit fails.
- Use one Pi RPC reader. Only the Pi RPC decoder/adapter boundary may produce validated assistant text; generic core has no Pi/Claude cases, imports, or closed harness DTOs. Public text uses the existing session-scoped outer `sessionId` and `harness.event` `{kind:"output",text}`; it never carries `inputId` or per-turn attribution. Every normalized input-state event, including pending, accepted, and terminal states, preserves the exact daemon `inputId`. No guarantee of replay, final text, or one-to-one text/input correlation.
- Expose no raw RPC, prompt, reasoning, raw error, stack, or cause. Never log prompt bodies. Unknown delivery after possible dispatch is uncertain, never retried or replayed. Do not make a fake callback/guard ACK. Callback/control/guard writes are outside this observer profile; known unsupported requests fail explicitly and safely. Missing-lease fail-closed behavior remains. Callback-bearing turns are not claimed supported.
- Bridge uses existing exact schemas: `server.hello`, `client.open` with `callbacks:[]`, correlated open ACK before snapshot begin/session/end, then ordered live envelopes. HTTP and pinned mutations share `instanceId`. Sequence is positive safe monotonic per instance, not a durable cursor. Preserve snapshot barrier; 1 MiB frame and 4 MiB queue/buffer limits disconnect on overflow, never truncate. Disconnect detaches only; no session/process stop, replay, auto-reconnect, or fabricated completion. Do not advertise callback/guard/full-mode readiness or unimplemented feature tokens; advertise `events.live` only if its complete wire/barrier semantics are implemented.
- Input, adapter, or configuration unsupported by current capability fails explicitly before effects; preserve unrelated adapters and future full callback parity. No new wire fields or API schema.

## Internal domain observation API

The durable manager exposes `events.subscribe(listener)` for committed, normalized domain records and synchronous `events.snapshot()` returning `{afterRevision,sessions}`. Revisions are ephemeral commit ordinals, not durable cursors or transport sequence. The strict generic session whitelist is `id,harnessId,cwd,status,name?,nativeSessionId?,adapterOptions?,failureReason?,failedAt?`. Events are `session.changed`, `session.deleted`, and `harness.event` containing only assistant output text or normalized input state. Execution producers may optionally subscribe to validated output events; lifecycle-only adapters remain valid. This is an internal domain API, not HTTP/WS schema or transport wiring.

## Non-goals

Claude, images, full callbacks, callback lease plumbing, controls, guard writes, replay/history, final-text guarantees, native SDK/model validation, paid model turns, app/CLI integration, default-v1 changes, and production rollout are excluded. No alternative wire, fake ACK, retry, second RPC reader, or harness-specific core routing.

## Affected surfaces

Daemon normative contracts: `docs/contracts/surfaces/api-v2.md`, `input-runtime.md`, `bridge-v2.md`, `bridge-messages.md`, `bridge-events.md`, `control-plane.md`, `harness-adapters.md`, `session-lifecycle.md`, `daemon-startup.md`; context: `docs/contracts/features/control-plane-v2.md`. The daemon/client matching feature contract is in the sibling harnessd worktree at `docs/contracts/features/llm-sessiond-v2-observable-turn.md`.

## Acceptance and validation

Use built client + separately spawned built opt-in daemon with temporary SQLite and controlled fake Pi RPC executable via existing `PI_EXECUTABLE` and the single reader. Verify one text submit, public text, and terminal state for exact input, plus resource cleanup. This proves fake transport/native-adapter integration, not a successful real model turn. Cover failed/uncertain outcomes, response loss/no replay, WS gap without fabricated terminal event, strict envelopes, opaque IDs, monotonic sequence, snapshot barrier, backpressure, stale-owner fences, and generic third-adapter/no-core-harness-case constraints. No real SDK/model claim; Windows/ACL are untested unless independently available. Run Node 24 checks including tests, typecheck/build/lint/format/version, production audit/package, diff and 100-line physical limit; perform independent review and parent acceptance of actual proof before completion. No new policy caps beyond existing norms.
