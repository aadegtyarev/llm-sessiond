# Control-plane API v2

- Status: Approved
- Date: 2026-11-01

## Goal

Make `llm-sessiond` the transport-neutral owner of durable sessions and execution, reusable by `harnessd` and `plasma-ai-assist`, while preserving the existing v1 contract.

## Boundary and behavior

`llm-sessiond` owns durable `SessionManager` state in SQLite, harness registration, Pi and Claude adapters, lifecycle/recovery/controls/events, and managed processes. Its clients use loopback HTTP and a duplex WebSocket callback/control bridge. API v1 remains backward compatible; API v2 carries the full transport-neutral control plane. No TLS, authentication, or non-loopback expansion is included.

The daemon-boundary IDs are authoritative and exact. Unavailable or uncertain operations fail explicitly; uncertain input is never replayed. Do not log prompts, reasoning, or raw errors.

Core owns generic lifecycle, persistence, registry, and capability routing only. Inject harness adapters through the registry; Pi/Claude are built-in composition choices, not core cases. A new harness requires no core, API-route, database-column, or closed DTO-union changes. Generic standard capabilities plus versioned namespaced schemas cover adapter-specific operations, events, and checkpoints.

## Scenarios

Support durable session lifecycle, exact resume, submission including images, exact current cancellation, recovery and uncertainty reporting without replay, status/usage, models/effort, reload, and runtime lifecycle events and controls. Preserve rich activity/anomaly events and advertised options, including agent file-send and interactive permission flows, for Pi and Claude clients.

## Non-goals

This contract does not include plasma integration, production switch, native harness removal, deployment/install/restart, or changes to v1 behavior.

## Affected surfaces

- [API v1](../surfaces/api-v1.md) — compatibility unchanged.
- [Session lifecycle](../surfaces/session-lifecycle.md).
- [API v2](../surfaces/api-v2.md), [duplex bridge](../surfaces/bridge-v2.md), [generic control plane](../surfaces/control-plane.md), [harness adapters](../surfaces/harness-adapters.md), and [persistence](../surfaces/persistence.md).

## Acceptance and validation

- Contract/fixture parity; deterministic disconnect, service-restart, and uncertain-operation tests.
- Real Pi and Claude smoke tests where credentials and tools are available.
- Node 24 tests, typecheck, build, lint, format, version, audit, and package checks; independent review.
- Planned release: `llm-sessiond` 0.2.0.
