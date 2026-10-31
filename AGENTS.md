# Project instructions

<!-- BEGIN ad-pi-addons contract workflow -->
## Contracts and feature work
- Read `docs/contracts/meta-contract.md` before implementing or reviewing a feature.
- Before implementation, agree on and save the approved feature contract under `docs/contracts/features/`; identify and read affected `docs/contracts/surfaces/` contracts.
- Give the exact contract paths to the planner, implementer, and reviewer. If working directly, use the same contracts as the source of truth.
- If implementation reveals a changed surface or acceptance scope, stop and get approval before proceeding. After verification, update affected surface contracts, mark the feature contract complete for final verification, then delete the temporary feature-contract file.
- Preserve existing instructions and surface contracts; never overwrite or delete them silently. Feature contracts are temporary task artifacts and must not remain after verified completion.
- Use available subagent roles only when configured. For nontrivial codebase or documentation reconnaissance, delegate bounded, read-only investigation to a suitable configured role when available; request relevant source paths and concise evidence, not whole-document dumps. Keep trivial lookups direct. The parent owns scope, decisions, synthesis, verification, and user communication. If no suitable role is available, work directly from the same contracts and checks, and state if independent review cannot be obtained. This rule does not require named Pi skills.
- End every task with a concise user-facing report of what changed, checks and outcomes, and remaining risks or blockers. Do not finish with tool output alone or end silently; this rule requires no installed skills.
<!-- END ad-pi-addons contract workflow -->

## Project-specific commands and conventions
- Stack and important paths: Planned Node.js 24+ strict TypeScript ESM service; `docs/contracts/` contains approved project contracts. Runtime is not implemented yet.
- Tests / typecheck / build: Not established; no runtime or dependencies are included in this documentation foundation.
- Formatting and style: Keep documentation concise; do not invent endpoints or implementation details absent from an approved contract.
- Project-specific constraints: Service owns sessions, harness, and process lifecycle. Pi is first harness, Claude follows. `harnessd` and `plasma-ai-assist` are future clients using a new API; compatibility belongs in clients. Never log prompt bodies. Unsupported capabilities fail explicitly; uncertain input is never auto-retried. Network scope is localhost loopback TCP HTTP + WebSocket JSON API v1 on Windows/Linux; no Unix sockets. TLS and bearer auth are roadmap/non-goals for now.
