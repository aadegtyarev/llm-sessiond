# Pi read-only model catalog

- Status: Implementation complete; pending review

## Goal and scenarios

Expose the existing generic `models.read` capability through an optional typed execution port and durable-manager query. Pi alone queries its currently owned running process for the native available-model catalog and returns the standard `ModelCatalog`. Empty catalogs are valid; unsupported, missing, stopped, stale, or malformed queries fail safely without lifecycle mutation or retry.

## Non-goals

No model/effort mutations or effort catalog; no options, commands, reload, Claude query, HTTP/WS/client/database/v1/main changes, new RPC reader, generic query framework, or fabricated catalog metadata.

## Affected surfaces

[Control plane](../surfaces/control-plane.md), [harness adapters](../surfaces/harness-adapters.md), [session lifecycle](../surfaces/session-lifecycle.md), [API v2](../surfaces/api-v2.md). Compatibility unchanged: [input runtime](../surfaces/input-runtime.md), [API v1](../surfaces/api-v1.md), [persistence](../surfaces/persistence.md).

## Interfaces and constraints

Core remains harness-agnostic. The optional typed catalog port returns a fresh safe standard DTO. Query Pi `get_available_models` through the existing correlated RPC reader; preserve exact IDs, spelling, order, and empty lists. Validate/project only declared model fields; reject malformed known data and strip unknown native fields. Never expose causes or native payloads. Require owned running execution and recheck owner, source generation, liveness, and lifecycle intent immediately before dispatch and after await; do not hold lifecycle locks across RPC.

## Acceptance and validation

Advertise `models.read` only on Pi. Test manager capability/ownership/stopped/stale fences and safe snapshots; test Pi correlated query, exact projection, empty/malformed/unknown fields, and failure safety. Run focused and regression tests, typecheck, build, lint, format, version, production audit, package, diff checks, and authored-file line-count check. Optional real-Pi smoke must issue no prompt and clean up child/temp state.
