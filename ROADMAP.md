# Roadmap

This roadmap records the approved direction; current runtime behavior is specified by the durable contracts in `docs/contracts/surfaces/`.

1. **Documentation foundation (complete):** Establish the separate `llm-sessiond` repository and approved constraints.
2. **Service runtime (Pi API v1 slice, complete):** Node.js 24+ strict TypeScript ESM service owns in-memory sessions and process lifecycle. Serve JSON API v1 over `127.0.0.1` TCP HTTP + WebSocket on Windows/Linux. Durable API and session lifecycle contracts are in `docs/contracts/surfaces/`.
3. **Harness sequence:** Support Pi first, then Claude.
4. **Client adoption:** `harnessd` and `plasma-ai-assist` are future clients. Implement compatibility in clients against the new API.
5. **Security roadmap:** TLS and bearer authentication remain future roadmap items; they are not part of the current scope.

No Unix sockets. Prompt bodies must not be logged; unsupported capabilities fail explicitly, and uncertain input is never auto-retried.
