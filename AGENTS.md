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
- Stack and important paths: strict TypeScript ES modules on Node.js 24; core is under `src/`, tests under `test/`, and contracts under `docs/contracts/`.
- Setup: Node.js 24.x and npm; run `npm ci --ignore-scripts --no-audit --no-fund` in a clean checkout. Exact devDependencies and their resolution are recorded in package.json/package-lock.json; see README.md for the quickstart.
- Tests / typecheck: `npm run typecheck` runs local `tsc --noEmit`; `npm test` runs `node --experimental-strip-types --test test/*.test.ts`. Toolchain: TypeScript 5.9.3 and @types/node 24.19.2, verified on Node.js v24.21.0; no build command is configured.
- Formatting and style: no project-specific formatter or source conventions are established.
- Project-specific constraints: `docs/contracts/surfaces/session-core.md` records the accepted implementation and is the current product contract for the session core. Review contract requirements by root cause and affected case class, not line-level nits.
