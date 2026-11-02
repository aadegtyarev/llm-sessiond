# Standalone API v2 bootstrap

- Status: Approved
- Date: 2026-11-01

## Goal

Provide a separately built, opt-in `npm run start:v2` bootstrap for the existing basic API v2 slice; leave default `npm start`/`main.ts` and v1 behavior unchanged. Keep `HOST` loopback-only (`127.0.0.1`), `PORT` default 4317 / integer 0..65535, and state precedence `LLM_SESSIOND_STATE_DIR` > `XDG_STATE_HOME/llm-sessiond` > home state directory; add no config families. Example: `LLM_SESSIOND_STATE_DIR=/tmp/llm-sessiond-v2-dev PORT=4318 npm run start:v2`.

## Scenarios

- Startup validates config and private/canonical state path, acquires the single owner lock before DB open/create/migration, claims generation, reconciles existing rows without launch/resume/replay, then composes built-in Pi/Claude durable runtime and injects the existing HTTP server. V1 routes remain real and discovery advertises v1+v2; only six existing basic v2 operations are wired and `features:[]` remains.
- A lock contender never invokes the DB opener. Startup failures roll back only acquired resources; DB-close failure retains lock and fails closed. If database opening acquires a native handle but initialization/migration fails, only confirmed handle close permits unlocking; unconfirmed close retains the owner lock. Constructor failure before handle acquisition and confirmed-close initialization failure still release the owned lock. No stale/dead PID lock stealing.
- Readiness/admission turn off synchronously during shutdown; close listener/new admissions, confirmed bounded owned instance/provider drain, transport cleanup including idle/upgraded sockets, revoke generation while DB is open, close DB, then unlock. Duplicate close/signals do not double-release or turn failure into clean exit. Signals during async startup are handled.
- Existing prepared-DB callers keep caller-owned DB lifetime. This component exposes acquired DB and exact generation for later runtime composition.

## Non-goals

No full daemon-mode/bridge readiness claim, bridge/API expansion, queue/bus/engine/framework, retries/replay/fallback, stale-lock stealing, new configuration, client/application integration, deployment/install/restart, or native/model jobs/prompts. Keep canonical revision-1 SQLite DDL and reconciliation/status/identity semantics. Windows paths follow existing rules; no real Windows/ACL verification claim.

## Affected surfaces

- [API v2](../surfaces/api-v2.md) (compatibility context only)
- [Persistence](../surfaces/persistence.md)
- [Session lifecycle](../surfaces/session-lifecycle.md)
- [API v1](../surfaces/api-v1.md) (compatibility-only)
- Future startup surface: `docs/contracts/surfaces/daemon-startup.md` (pending; not a link until created after accepted completion)

## Interfaces and constraints

Extend the existing owned-store primitive, not a parallel owner framework. Keep prepared-DB acquire compatible; add a narrow open-and-own mode that invokes the opener only after lock acquisition, exposes DB and exact generation, and owns DB shutdown. Teardown is idempotent: revoke -> owned DB close -> lock release. Failed/unconfirmed cleanup cannot report success or release foreign ownership. Diagnostics are static/controlled; never log raw backend error/getter/message/stack/cause. Success may report public loopback port.

## Acceptance criteria

Acceptance: preserve real v1 service/routes with opt-in basic v2 startup; validate lock-before-DB and startup/rollback/shutdown ownership order, readiness/admission fencing, signal races, transport cleanup, and no launch/replay on reconciliation. Store tests prove contender-before-opener; constructor/open failure cleanup; init/migration failure across PRAGMA, newer schema, and malformed revision-1 schema with confirmed and unconfirmed close; claim failure rollback; DB-close failure retains lock; revoke/close/unlock order; duplicate close idempotence; malformed/foreign lock fails closed; and borrowed DB compatibility. Isolated Node daemon + client smoke must not run model turns. No parity scope expansion.

## Validation

Validate focused ownership/startup tests, full `npm test` including SQLite suites, typecheck/build/lint/format/version, production audit, package dry-run, `git diff --check`, and cumulative authored-file 100-line gate. Run isolated process/client smoke without model prompts. Independent parent precheck is required before handoff.
