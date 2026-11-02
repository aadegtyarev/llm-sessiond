# Pi command catalog

- Status: Implemented; pending independent review
- Feature contract: `docs/contracts/features/pi-command-catalog.md`

## Goal and behavior

Expose the Pi adapter's read-only `commands.read` capability as the standard v2 inventory `{commands:[{name,description}]}`. Query native `get_commands` only through its existing correlated reader. Preserve eligible native order, exact names/descriptions, and empty results. Missing eligible description becomes `""`; a present malformed description fails safely. Advertise only eligible extension commands: `source === "extension"`, valid lower-case native command name matching `^[a-z][a-z0-9_-]{0,31}$`, excluding `reload`. Drop native fields outside the standard projection. Generic adapters retain their standard unrestricted string DTO behavior.

## Scenarios and failures

The catalog is available only for an owned, capable, running execution. Missing/stopped/unavailable executions fail explicitly without RPC, resume, retry, or lifecycle mutation. Correlation, ownership, source-generation, liveness, stop, and shutdown fences apply before and after the query. Malformed/accessor data or RPC failures return safe errors. Results are fresh plain snapshots with validated primitive fields and no native references.

## Non-goals

No command invocation or `commands.run` advertisement; no setter, prompt, skills, reload, HTTP/WS/client wiring, v1 changes, persistence, logging, or forwarding of native metadata. No changes to Claude or generic command-name eligibility.

## Affected surfaces

[Control plane](../surfaces/control-plane.md), [harness adapters](../surfaces/harness-adapters.md), [session lifecycle](../surfaces/session-lifecycle.md), [API v2](../surfaces/api-v2.md); compatibility constraints: [input runtime](../surfaces/input-runtime.md), [API v1](../surfaces/api-v1.md), [persistence](../surfaces/persistence.md).

## Acceptance and validation

Test native eligibility, exact order/values/empty catalog, missing versus malformed description, strict generic DTO validation, snapshot isolation, query ownership/lifecycle/correlation/concurrency fences, and v1 unchanged. Run focused tests and all project test, typecheck, build, lint, format, version, audit, package, authored-file line-count, and diff checks under Node 24.
