# Roadmap

This roadmap records only the approved direction. Runtime API details and implementation plans require a separate handoff.

1. **Documentation foundation (current):** Establish the separate `llm-sessiond` repository and approved constraints; no runtime code or dependencies.
2. **Service runtime:** Build a Node.js 24+ strict TypeScript ESM service owning sessions, harnesses, and process lifecycle. Serve JSON API v1 over localhost loopback TCP HTTP + WebSocket on Windows/Linux.
3. **Harness sequence:** Support Pi first, then Claude.
4. **Client adoption:** `harnessd` and `plasma-ai-assist` are future clients. Implement compatibility in clients against the new API.
5. **Security roadmap:** TLS and bearer authentication remain future roadmap items; they are not part of the current scope.

No Unix sockets. Prompt bodies must not be logged; unsupported capabilities fail explicitly, and uncertain input is never auto-retried.
