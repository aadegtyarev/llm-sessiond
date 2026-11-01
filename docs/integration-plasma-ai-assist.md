# plasma-ai-assist integration plan

## Seam mapping (future work; no client changes in this slice)

- `aiassist/engines/pi.py` currently owns Pi command construction, process start, `get_state`, JSONL I/O, prompt submission, and resume. Replace this ownership with API session creation, `GET /api/v1/sessions/:id`, `POST .../inputs`, `POST .../stop|resume`, and API-provided native session state.
- Map `send_prompt(text, images)` to `{text,images:[{mimeType,data}]}`. Preserve the returned `inputId` for exact cancellation. A 409 delivery-uncertain result/event is terminal for that input; never retry it.
- Translate filtered WebSocket `assistant.delta`, `input.state`, `session.status`, `activity`, `notification`, `session.error`, and `turn.completed` into the existing Engine/Hub event flow. Treat events as process-local and non-replayable.
- Current `/tools` integration, approval extension/dialog handling, model selection/discovery, system prompt injection, and arbitrary extra Pi arguments have no API seam and are not provided by this service. Keep them client-owned or explicitly unavailable; do not assume capability parity.

## Phased checklist

1. Map each PiEngine caller to session, input, event, and shutdown operations; list unsupported model/tools/approval features.
2. Add an API-backed engine/client alongside the current PiEngine; retain local Pi fallback only during a reviewed rollout.
3. Validate image/base64 and event translation; test exact resume IDs, cancellation, reconnect loss, uncertain no-retry, and concurrent sessions.
4. Verify prompt privacy and confirm the service—not plasma-ai-assist—owns child process cleanup after adoption.
5. Migrate only with separate approval and end-to-end parity evidence; remove direct Pi RPC ownership in the plasma-ai-assist repository as its own change.
