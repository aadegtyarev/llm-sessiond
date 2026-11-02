# Pi read-only effort catalog

- Status: Approved for implementation; pending final verification
- Date: 2026-11-02

## Goal

Expose Pi's authoritative available effort levels through the existing generic read-only effort catalog port, without adding a setter or Pi-specific core behavior.

## Scenarios

- An owned running Pi execution queries `get_available_thinking_levels` through the existing correlated RPC reader.
- Preserve valid arbitrary effort strings, order, and empty lists; omit `current` because this RPC does not report it.
- Reject malformed native data safely and return a fresh standard DTO.

## Non-goals

No effort setter, other catalogs or controls, Claude changes, HTTP/WS/client/DB/v1 changes, generic query framework, retries, resume, startup work, or prompt/model jobs.

## Affected surfaces

- [Generic control plane](../surfaces/control-plane.md)
- [Harness adapters](../surfaces/harness-adapters.md)
- [Session lifecycle](../surfaces/session-lifecycle.md)
- [API v2](../surfaces/api-v2.md)
- Compatibility checked: [input runtime](../surfaces/input-runtime.md), [API v1](../surfaces/api-v1.md), [persistence](../surfaces/persistence.md)

## Interface and constraints

Use the existing standard `EffortCatalog={levels:string[],current?:string}` DTO. Integrate only with the current owned running Pi execution, existing `models/effort` capability conventions and correlated RPC reader. Require an optional typed execution port and manager read method. Preserve the lifecycle query's ownership/source-generation/liveness/pending/stop/shutdown fences before invocation and after await; recheck immediately before invoking captured adapter method, preserving `this`, without holding lifecycle locks over RPC. Validate and copy only approved standard fields and primitive strings; discard native extra fields and references. Never infer or fabricate values; safe DTO/accessor failures must not expose native errors.

## Acceptance criteria

- Pi honestly advertises `effort.read` only when the read-only catalog is integrated; generic core contains no Pi-specific case.
- Pi queries `get_available_thinking_levels` on its existing correlated reader, returns exact valid strings/order/empty list, and omits unreported `current`.
- Malformed/accessor/prototype/sparse/unknown native data fails safely; snapshots are fresh and contain no native references or extra fields.
- Query is restricted to a currently owned running execution and cannot resume, retry, mutate lifecycle, disrupt active input, or use a duplicate reader.
- No v1, transport, persistence, or other adapter behavior changes.

## Validation

Run focused regression tests, full `npm test`, `npm run typecheck`, `npm run build`, `npm run lint`, `npm run format:check`, `npm run version:check`, production dependency audit at low level, package check, `git diff --check`, and authored-file physical line count. Node 24+ required. Review exact cumulative diff against all affected surfaces; optional real Pi no-prompt read smoke only when available and safely cleaned up.
