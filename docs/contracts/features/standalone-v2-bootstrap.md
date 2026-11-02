# Standalone API v2 bootstrap

- Status: Approved
- Date: 2026-11-01

## Goal

Provide an explicitly opt-in standalone bootstrap for the existing basic API v2 slice, while leaving default `npm start` and v1 behavior unchanged. This component establishes durable-store ownership safely before startup composition.

## Scenarios

- Acquire exclusive lock before opening/migrating the database; a contender must never invoke the database opener.
- On opener or generation-claim failure, clean up only resources acquired by this attempt, closing an owned database before unlocking.
- Close once or concurrently: revoke generation, close owned database, then release lock. Unconfirmed DB cleanup retains the lock and fails explicitly.
- Preserve callers that pass an already-open database: their lease does not own/close that database.

## Non-goals

No daemon entrypoint, server, runtime/adapters, routes, schema/reconciliation changes, stale-lock stealing, retry/replay, additional configuration, or broader control-plane parity. No Windows ACL verification claim.

## Affected surfaces

- [API v2](../surfaces/api-v2.md) (compatibility context only)
- [Persistence](../surfaces/persistence.md)
- [Session lifecycle](../surfaces/session-lifecycle.md)
- [API v1](../surfaces/api-v1.md) (compatibility-only)
- Future startup surface: `docs/contracts/surfaces/daemon-startup.md` (pending; not a link until created after accepted completion)

## Interfaces and constraints

Extend the existing owned-store primitive, not a parallel owner framework. Keep the prepared-DB acquire caller compatible; add a narrow open-and-own mode that opens only after lock acquisition and exposes the database and exact claimed generation for composition. Teardown is idempotent and ordered revoke -> owned DB close -> lock release. Failed/unconfirmed cleanup cannot report successful release or unlock foreign ownership. Preserve canonical revision-1 SQLite schema and existing lock/generation semantics.

## Acceptance criteria

Focused tests prove contender-before-opener ordering; opener failure unlock; generation failure closes DB before unlock; DB close failure retains lock; normal revoke/close/unlock ordering; duplicate/concurrent close idempotence; and legacy prepared-DB compatibility. No changes outside persistence ownership and directly needed tests/helpers.

## Validation

Focused persistence tests, full `npm test` including SQLite suites, typecheck, build, lint, format:check, version:check, production audit, pack dry-run, `git diff --check`, and cumulative authored-file 100-physical-line gate. Independent parent precheck is required before handoff.