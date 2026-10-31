# llm-sessiond

A separate service and runtime dependency for managing LLM sessions and harness/process lifecycle.

## Status

Approved documentation foundation only. No runtime implementation or dependencies are included.

## Direction

- Node.js 24+ with strict TypeScript ESM.
- Localhost loopback TCP HTTP + WebSocket JSON API v1; Windows and Linux.
- Pi harness first; Claude next. `harnessd` and `plasma-ai-assist` are future clients.
- API compatibility is handled in clients; this service exposes a new API.
- Prompt bodies are never logged. Unsupported capabilities fail explicitly; uncertain input is never auto-retried.
- No Unix sockets. TLS and bearer authentication are roadmap items and are not implemented now.

See [ROADMAP.md](ROADMAP.md) and the approved [initial service contract](docs/contracts/features/initial-service.md). Endpoint shapes and other runtime details are intentionally unspecified pending a separate implementation handoff.
