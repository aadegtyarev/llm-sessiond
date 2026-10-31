# Pi API v1 service slice

**Status:** Approved for implementation

## Goal

Implement a standalone Node.js 24+ strict TypeScript ESM service with a JSON API v1 and Pi harness. It owns in-memory sessions and Pi process lifecycles through transport-neutral `HarnessAdapter` and `ProcessProvider` boundaries.

## Scenarios

- Start HTTP + WebSocket only on `127.0.0.1`; reject or fail configuration for any other bind. No Unix sockets, TLS, or auth.
- Advertise Pi harness and capabilities. Create/list/get sessions; submit, cancel exact accepted/current input, stop, and resume only with exact native Pi session ID.
- Pi launches configurable executable using `--mode rpc`, `shell:false`; parse LF/CRLF JSONL and obtain native ID via `get_state`.
- Map text, activity, input, and lifecycle events. Handle malformed protocol data safely; never retry uncertain input.
- Serve filtered/unfiltered versioned WebSocket events; bound body, text, images, JSONL records, and slow-client buffering.
- Graceful shutdown cleans children; independent concurrent sessions work.

## Interfaces

All JSON objects reject unknown fields. `GET /api/v1/health` returns `{apiVersion:"v1",status:"ready",version}`. `GET /api/v1/harnesses` returns `{harnesses:[{id,label,capabilities:string[]}]}`. `GET /api/v1/sessions` returns `{sessions:SessionSummary[]}`; `POST /api/v1/sessions` accepts `{harnessId:"pi",cwd:absolute-existing-directory,name?}` and returns 201 `{session}`; `GET /api/v1/sessions/:id` returns `{session}`.

`SessionSummary={id,name?,harnessId,cwd,status:"starting"|"running"|"stopped"|"failed"|"uncertain",nativeSessionId?,failure?}` and `failure={code,at}`. `POST /api/v1/sessions/:id/inputs` accepts `{text,images?}` where `images=[{mimeType,data:base64}]`, returns 202 `{inputId}`. Text limit is 256 KiB UTF-8; JSON HTTP body 24 MiB; decoded images total 20 MiB. `POST .../cancel` accepts `{inputId}` and targets that exact accepted/current input. `POST .../stop` and `POST .../resume` accept absent body or `{}` only, return 204. Resume requires exact native ID; no ID guessing.

All errors return `{error:{code,message}}`: 400 validation, 404 missing resource, 409 lifecycle/capability, 413 limits, 500 safe internal. Never expose exceptions, prompt, or stderr. Unsupported capabilities fail explicitly.

`/api/v1/events` WebSocket accepts optional `sessionId` query. Envelopes are `{apiVersion:"v1",eventId,sessionId,type,at,data}`; `eventId` is process-local monotonic. Types: `session.status`, `input.state`, `assistant.delta`, `activity`, `notification`, `session.error`, `turn.completed`. `input.state` data is `{inputId,state:"pending"|"accepted"|"completed"|"failed"|"uncertain",reason?}`; `assistant.delta` is `{text}`; `session.status` is `{status,failure?}`. JSONL record limit 1 MiB; close slow clients at bounded WebSocket buffering. No event replay guarantee.

## Non-goals

Service-restart recovery, durable history/state, Claude, client migrations, models/tools/approvals/files APIs, full reasoning exposure, TLS, bearer auth, Unix sockets, GitHub operations, release, installation, or deployment.

## Affected surfaces

No current affected surface contracts exist. This feature creates durable future surfaces `docs/contracts/surfaces/api-v1.md` and `docs/contracts/surfaces/session-lifecycle.md`; update them after implementation verification.

## Acceptance criteria

- Validate and document exact request/response/error/event schemas and reject unknown object fields.
- Fake Pi integration tests cover strict loopback bind, create→submit→text/input events→cancel/stop→exact resume, uncertain/no retry, malformed JSON, concurrent sessions, and cleanup.
- Prompt bodies are never logged; unsupported capabilities fail explicitly; bounds and WebSocket backpressure are enforced.
- `npm test`, typecheck, build, lint, format check, version check, `git diff --check`, and authored-file line-count checks pass.
- Add concise README usage/API summary and client integration seam/phased checklists; do not migrate clients.

## Validation

Run all acceptance checks with a fake Pi process; real Pi smoke is optional and must not invoke a model unless safe. Review contract scope and resulting surface contracts. Each authored file is at most 100 lines.
