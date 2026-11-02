# Pi live status and usage

- Status: Complete; implementation, gates, and independent review verified.

## Goal

Expose a read-only, normalized live status/usage query for a currently owned, running Pi execution through the existing generic v2 control plane. Pi alone advertises `status.read` and `usage.read` when integrated.

## Scenarios

- A running, owned Pi session returns only validated optional model `{provider,id,name}`, effort, and usage fields using the standard `LiveStatus` DTO.
- Missing, stopped, unowned, unsupported, shutting-down, or stale-generation executions fail explicitly without RPC, resume, or retry.
- A query does not hold a lifecycle lock while awaiting RPC; ownership, source/generation, and liveness are rechecked before exposing its reply.
- Pi uses the existing correlated durable RPC reader for `get_state` and session stats. Invalid replies fail safely; late/wrong IDs cannot become results.
- Claude and third-party adapters remain generic and unchanged; v1 is unchanged.

## Non-goals

No generic query framework/catalog, model/effort mutation, options, commands, reload, callbacks, rich output, HTTP/WS/client wiring, protocol/DB changes, prompt or raw-error logging/forwarding, autoresume, or automatic retry.

## Affected surfaces

- [Control plane](../surfaces/control-plane.md)
- [Harness adapters](../surfaces/harness-adapters.md)
- [Session lifecycle](../surfaces/session-lifecycle.md)
- [Input runtime](../surfaces/input-runtime.md)
- [API v2](../surfaces/api-v2.md)
- Compatibility unchanged: [API v1](../surfaces/api-v1.md), [persistence](../surfaces/persistence.md)

## Constraints

Use standard `status.read`/`usage.read` capabilities and existing DTO definitions. Keep optional execution port and composition typed; core must not import Pi/Claude or contain harness-specific cases. Project only approved standard fields, preserve zero/null/absence, reject malformed data and strip all other native properties. Querying while input is active is allowed only through the same serialized reader. Query does not mutate session status.

## Acceptance and validation

Deterministic tests cover projection/correlation, invalid data and non-leakage, unsupported/stopped/missing no-RPC/no-resume, stale ownership/generation/stop/shutdown fencing, concurrent input query, and generic third-adapter composition. Run focused tests and project test, typecheck, build, lint, format, version, audit, package, diff, and authored-file line-count checks. Optional safe Pi smoke uses no prompt and cleans its temporary native folder.
