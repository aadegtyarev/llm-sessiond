# JSON API v1

## Boundary and ownership

`llm-sessiond` exposes versioned HTTP JSON and WebSocket on TCP `127.0.0.1` only. It owns process-local API event IDs and serves in-memory session state. Consumers are local clients; clients own compatibility. Schemas reject unknown object fields.

## HTTP routes

- `GET /api/v1/health` → `{apiVersion:"v1",status:"ready",version:string}`.
- `GET /api/v1/harnesses` → `{harnesses:[{id,label,capabilities:string[]}]}`. Pi is `id:"pi"`, label `"Pi"`, capabilities `input.submit`, `harness.cancel`, `harness.stop`, `harness.resume`.
- `GET /api/v1/sessions` → `{sessions:SessionSummary[]}`.
- `POST /api/v1/sessions` accepts `{harnessId:"pi",cwd:absolute-existing-directory,name?:string}` → 201 `{session:SessionSummary}`.
- `GET /api/v1/sessions/:id` → `{session:SessionSummary}`.
- `POST /api/v1/sessions/:id/inputs` accepts `{text:string,images?:[{mimeType:string,data:base64}]}` → 202 `{inputId:uuid}`.
- `POST /api/v1/sessions/:id/cancel` accepts `{inputId:uuid}` and targets that exact accepted/current input → 204.
- `POST /api/v1/sessions/:id/stop` and `/resume` accept no body or `{}` → 204.

`SessionSummary={id:uuid,name?:string,harnessId:"pi",cwd,status:"starting"|"running"|"stopped"|"failed"|"uncertain",nativeSessionId?:string,failure?:{code:"PI_STARTUP_FAILED"|"PI_RESUME_FAILED"|"PI_PROCESS_EXITED"|"PI_MALFORMED_JSON",at:ISO-8601}}`. Optional properties are omitted when absent.

## Errors, validation, and bounds

Errors are `{error:{code,message}}`; messages are safe and contain no raw exception, prompt, or stderr. Codes are validated: 400 `INVALID_CWD`, `INVALID_JSON`, `INVALID_PATH`, `VALIDATION_ERROR`; 404 `NOT_FOUND`; 409 `CANCEL_FAILED`, `INPUT_BUSY`, `INPUT_NOT_CURRENT`, `INPUT_UNCERTAIN`, `RESUME_FAILED`, `SESSION_NOT_RESUMABLE`, `SESSION_NOT_RUNNING`; 413 `LIMIT_EXCEEDED`; 500 `INPUT_FAILED`, `INTERNAL_ERROR`. No unsupported capability is silently ignored. Session failure codes are `PI_STARTUP_FAILED`, `PI_RESUME_FAILED`, `PI_PROCESS_EXITED`, and `PI_MALFORMED_JSON`.

HTTP JSON body ≤24 MiB; prompt text ≤256 KiB UTF-8; decoded image bytes total ≤20 MiB. Images must have canonical base64 data. JSONL records are ≤1 MiB. Oversized requests/records fail safely. The effective image maximum may be lower where base64 encoding exceeds the HTTP body limit.

## WebSocket events

`/api/v1/events` accepts optional `sessionId` query filter. Each JSON envelope is `{apiVersion:"v1",eventId:positive-integer,sessionId:uuid,type,at:ISO-8601,data}`. IDs increase monotonically within the current process; no replay or durability guarantee. Types/data: `session.status` `{status,failure?}`; `input.state` `{inputId,state:"pending"|"accepted"|"completed"|"failed"|"uncertain",reason?}`; `assistant.delta` `{text}`; `activity` is one strict shape: lifecycle/message-boundary `{type:"agent_start"|"agent_end"|"agent_settled"|"compaction_start"|"compaction_end"|"assistant_message_end"}`, thinking `{type:"thinking",active:boolean}`, tool start `{type:"tool_start",toolCallId,toolName?}`, or tool end `{type:"tool_end",toolCallId,toolName?,failed?}`; `notification` `{text}`; `session.error` `{code}`; `turn.completed` `{}`. Every envelope and strict data shape is runtime-validated. Slow clients are closed before `bufferedAmount` exceeds 256 KiB.

## Security and non-goals

No non-loopback bind, Unix sockets, TLS, bearer auth, prompt logging, full reasoning content, durable history, or restart recovery. Unsupported capabilities return explicit errors. Related: [session lifecycle](session-lifecycle.md).
