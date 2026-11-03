# Approved contract: simple runtime rewrite

Status: Approved by operator; implementation in progress.

## Goal

Reimplement the llm-sessiond runtime around one core: API outward, core, interfaces, then harness adapters. This is a from-scratch implementation in an isolated task worktree, not incremental layering on the old implementation.

## Scope and scenarios

Preserve implemented external API v1 and v2 behavior, persistence compatibility, ownership/uncertainty/privacy guarantees, and lifecycle semantics. One core owns shared business rules; API versions are boundary projections. Keep full future parity as a separate roadmap goal; do not add features simultaneously.

## Non-goals

No deployment, install, version bump, push, PR, merge, or production operation. No new functions, framework/dependency choice, interface/class design, or migration of semantics. Do not force tests to depend on old private classes.

## Affected surfaces

- [API v1](../surfaces/api-v1.md), [API v2](../surfaces/api-v2.md)
- [Persistence](../surfaces/persistence.md), [input runtime](../surfaces/input-runtime.md)
- [Bridge v2](../surfaces/bridge-v2.md), [messages](../surfaces/bridge-messages.md), [events](../surfaces/bridge-events.md)
- [Control plane](../surfaces/control-plane.md), [harness adapters](../surfaces/harness-adapters.md)
- [Session lifecycle](../surfaces/session-lifecycle.md), [daemon startup](../surfaces/daemon-startup.md)

## Constraints

Preserve default `npm start`/main v1 and opt-in `start:v2`; loopback IPv4 HTTP/WebSocket JSON on Node 24+ (Windows compatibility required, not proven here); SQLite canonical revision 1, fail-closed exclusive owner lock and startup reconciliation. Retain exact case-sensitive IDs, strict schemas, bounded requests/responses, explicit unsupported behavior, and whitelisted safe projections.

V1 retains its actual route/WS/input/image/cancel/resume behavior and default in-memory profile. V2 retains implemented health/harness/session create-list-get-stop, one-submit input with `resumed`, boot-instance fencing, pinned hello/ACK, snapshot/live event flow, and exact safe error outcomes. Do not change v1 ephemeral defaults or cross-profile visibility without verifying behavior.

Retain one Pi RPC reader, native ACK distinct from input settlement, existing Pi/Claude capabilities (including currently unexposed query/cancel/image/effort functions), and strict known-unsupported request families. Preserve SQLite data/checkpoints, cleanup/owner-lock guarantees, and uncertainty on observer gaps or failed child stop. Never expose/log prompts, reasoning, credentials, raw exceptions or stderr; never retry, replay, autoreconnect, or fallback.

Compatibility decisions must be grounded in current source and fixtures. Golden/future-parity test models are not production behavior. Public tests should verify external behavior, not require legacy private class structure. The core owns logical session/input state; harness adapters own native RPC/child details. Use few real boundaries, validate at them, and keep scenarios sequential/readable; no wrapper proliferation to satisfy file limits. Libraries are allowed; a new framework/dependency needs a credible large benefit and explicit operator approval.

## Acceptance

- Both isolated worktrees begin at their exact approved reference commits; donor/reference repositories remain untouched.
- Contract paths and compatibility matrix identify current implemented versus internal-only/unsupported behavior and representative external verification.
- Later rewrite slices preserve each applicable surface contract; no simultaneous new features.

## Validation

For each implementation slice, run applicable focused tests and project validation; verify authored-file line counts and `git diff --check`. Final validation covers tests, typecheck, build, lint, format, version, production audit, pack, and repository state.
