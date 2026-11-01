# Session and harness process lifecycle

## Boundary and ownership

The service owns harness processes through `HarnessAdapter` and `ProcessProvider` ports. Pi's v1 lifecycle remains as specified below. The v2 Claude lifecycle uses the durable manager and adapter checkpoint.

## Claude lifecycle (API v2)

The `claude-code` adapter (alias `claude`) starts Claude CLI in stream-json print mode with a daemon-generated UUID passed as `--session-id`. It sends only a private correlated `initialize` control request; a valid correlated success response establishes readiness. No prompt, model turn, or synthetic initialization event is sent. Any startup metadata declaring `session_id` must match the exact UUID; a `system/init` record is not required before the initialize acknowledgement. Resume requires the exact `claude.session` v1 checkpoint and starts `--resume <UUID>` without fallback; absence of a saved transcript fails explicitly. Stop is bounded and succeeds only after child exit is confirmed. Only launch, resume, and stop are advertised; no empty transcript resumability guarantee is made.

## Observable flow

Create requires an absolute existing directory, inserts a `starting` session, starts Pi, obtains `nativeSessionId` from correlated successful `get_state`, and then reports `running`. Startup failure is safe and leaves `failed` with `{code,at}`. Stop performs bounded SIGTERM then SIGKILL cleanup and reports `stopped`; an accepted input interrupted by stop emits `input.state:uncertain`. Resume is allowed only for a stopped session with the exact saved native ID; startup failure reports `failed`. Unexpected child exit updates lifecycle status.

Submit permits one active input per session and sends Pi RPC `prompt` with the original text, optional image records, and `streamingBehavior:"steer"`. A correlated successful response is accepted; correlated rejection is definite failure. Timeout/write ambiguity emits `input.state:uncertain`; the service never retries and blocks another active submit until the process reports settled or is stopped. Cancel requires the exact accepted/current input ID and sends correlated RPC `abort`. Abort timeout is uncertain and is never repeated automatically; a mismatched, unaccepted, uncertain, or already-canceling input is rejected.

Resume preserves the native ID and cwd; IDs are never inferred from local data. Pi JSONL accepts LF/CRLF and records are capped at 1 MiB. RPC requests are `{id,type,...}`; correlated replies must be `{type:"response",id,command,success,data?}` with matching ID/command and boolean `success`. Readiness is `{id,type:"get_state"}` and requires `data.sessionId`. Submit is `{id,type:"prompt",message,streamingBehavior:"steer",images?:[{type:"image",data,mimeType}]}`; cancellation is correlated `{id,type:"abort"}`. Malformed/oversized records fail safely without exposing raw record text.

Pi `message_update` with `assistantMessageEvent.type:"text_delta"` maps to `assistant.delta`; `message_end` assistant and `agent_settled` map to message/turn completion. `thinking_start/end` maps only to activity state, never reasoning text. `tool_execution_start/end` maps tool ID/name/error status without raw args/results. `agent_start/end/settled`, `compaction_start/end`, and `extension_ui_request` `notify` map to activity/notification events.

## Failure, recovery, and retention

The service keeps state only in memory. Restart recovery, durable history, and event replay are not guaranteed. Graceful shutdown stops all children with bounded escalation. Uncertain delivery remains explicit; no prompt is re-sent. Process output/stderr and prompt bodies are not logged.

## Non-goals and related contracts

No additional Claude models/tools/approvals/files capabilities, service restart process recovery, TLS, auth, or client migration. See [API v1](api-v1.md), [adapter checkpoints](harness-adapters.md), and the harnessd Pi RPC compatibility source/test (`harnessd/src/harness/pi-rpc-harness.ts`, `harnessd/test/pi-rpc-harness.test.ts`).
