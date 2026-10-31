# Initial service foundation

**Status:** Approved

## Goal and behavior

Create a separate `llm-sessiond` service/repository as a runtime dependency, not a submodule. This task establishes documentation only; implementation requires a separate handoff.

## Scenarios and constraints

- Target platforms are Windows and Linux; networking is localhost loopback TCP with HTTP + WebSocket JSON API v1. No Unix sockets.
- The service owns sessions, harnesses, and process lifecycle. Support Pi first, Claude next.
- `harnessd` and `plasma-ai-assist` are future clients. This is a new API; compatibility belongs in clients.
- Never log prompt bodies. Unsupported capabilities fail explicitly. Uncertain input is never auto-retried.
- TLS and bearer authentication are roadmap/non-goals for the current scope.
- Planned stack: Node.js 24+ strict TypeScript ESM.

## Non-goals

No runtime code, dependencies, API endpoints/schema, TLS, bearer authentication, Unix sockets, GitHub repository, push, PR, release, installation, or deployment.

## Affected surfaces

Пока отсутствуют; this foundation creates no implemented service surface.

## Acceptance criteria

- A local Git repository exists on branch `feat/initial-service-foundation`, created from `main` after initialization.
- Bootstrap-provided `docs/contracts/meta-contract.md` and workflow in `AGENTS.md` are preserved; project-specific instructions record the approved constraints.
- `README.md` states service positioning and documentation-only status; `ROADMAP.md` records the approved sequence.
- This contract records the approved constraints and explicitly states that affected surfaces are absent.
- No runtime code or dependencies are added; documentation files are each at most 100 lines.
- `git diff --check` passes and the documentation foundation is committed locally.

## Validation

Inspect the changed files and line counts; verify the branch, local commit, absence of runtime/dependency additions, and clean `git diff --check`. Do not begin implementation until a separate handoff.
