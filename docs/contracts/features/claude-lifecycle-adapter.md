# Claude lifecycle adapter slice

- Status: Approved for implementation
- Related feature: [Control plane v2](control-plane-v2.md)

## Goal

Add Claude CLI launch, exact resume, and stop as an injected durable lifecycle adapter without changing v1 or broad capability parity.

## Scenarios and constraints

- Register `claude-code` with alias `claude`; advertise exactly `harness.launch`, `harness.resume`, and `harness.stop`.
- Persist only strict `claude.session` v1 checkpoint `{sessionId: UUID}`. Preserve UUID spelling/case; reject unknown schemas and malformed IDs.
- Launch a daemon-generated UUID via Claude stream-json `--session-id`; resume exact checkpoint ID using `--resume`. A private correlated initialize handshake proves startup; no prompt/input is sent or required.
- Reject unsupported non-undefined options before spawn. Fail safely on malformed, oversized, mismatched, missing, erroneous, timed-out, or early-exit startup; cleanup must confirm child exit and retain ownership on failure.
- Composition binds registered adapter instances to injected factories, supports Pi, Claude, and third adapters; preserve `createPiDurableRuntime` compatibility.

## Non-goals

No other adapter methods/capabilities, prompts, model turns, public protocol passthrough, core/API/DB/v1 changes, `main.ts` wiring, or harnessd changes. Empty transcript resumability is not promised.

## Affected surfaces

- [Control plane](../surfaces/control-plane.md)
- [Harness adapters](../surfaces/harness-adapters.md)
- [Persistence](../surfaces/persistence.md)
- [Session lifecycle](../surfaces/session-lifecycle.md)
- [API v1](../surfaces/api-v1.md)
- [API v2](../surfaces/api-v2.md)

## Acceptance and validation

Test strict checkpoint/UUID and option validation, launch/resume identity and no-input initialization, startup failure/cleanup, persistence failure, stop retry/concurrency/timeout, and open composition registration. Run Node 24 tests, typecheck, build, lint, format, version, audit, pack, diff, and authored-file line checks. Keep every authored file at most 100 lines; v1 behavior remains unchanged.
