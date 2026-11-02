# V2 prepared-runtime HTTP discovery

- Status: Approved for the discovery slice
- Date: 2026-11-01

## Goal

Expose only the two existing normative read-only v2 discovery resources when an already prepared durable runtime is explicitly injected into the existing API server. Default server/main behavior remains v1.

## Scenario and interfaces

Injected `GET /api/v2/health` reports revision 1, actual service version, one opaque boot identity stable for the server lifetime, supported versions `v1` and `v2`, and only conservatively supported features. Injected `GET /api/v2/harnesses` reports the canonical default and standard public descriptors from the actual registry, without serializing adapter objects. Unknown v2 routes fail safely. Health readiness is derived from the prepared owned runtime and becomes false synchronously when closing begins; no caller-supplied readiness flag is accepted.

## Non-goals and affected surfaces

No production activation/bootstrap, mutations, sessions, bridge, events, client migration, or changes to main/v1 behavior. The server does not own or shut down injected runtime resources. No adapter-specific implementation or capability is invented.

Affected contracts: [API v2](../surfaces/api-v2.md), [control plane](../surfaces/control-plane.md), [session lifecycle](../surfaces/session-lifecycle.md), [harness adapters](../surfaces/harness-adapters.md). Compatibility references: [API v1](../surfaces/api-v1.md) and [persistence](../surfaces/persistence.md).

## Acceptance and validation

Exercise both GETs through a real ephemeral-loopback HTTP server with an actually prepared durable runtime, plus no-injection v1 compatibility and readiness loss/close/error privacy. Cover aliases, canonical default, descriptor snapshot safety, stable/fresh boot identity, actual service version, empty features, third-party registry entry, and no native child launch.

Run Node 24 tests, typecheck, build, lint, format, version, audit, package dry-run, diff checks, and the 100-physical-line authored-file limit. No claim of full API v2 or production daemon readiness.

## Review-required boundary invariants

- Copy descriptor fields and nested JSON into independent plain data before strict validation; preserve source order and declared values, run the final owner/readiness fence after validation, and never emit source references or hooks.
- Apply the existing strict adapter descriptor schema after snapshot, including options, extension operations/events, IDs, aliases, and capabilities. Keep established option bounds; invent no public limits.
- Every exception from prepared runtime/registry/descriptors is untrusted and maps to fixed unavailable 503. Unknown route/method is an explicit safe 404 result, not a trusted backend exception. Preserve legacy v1 error behavior.
- V2 404/503 use the full strict safe error DTO with opaque reference and outcome `not-applied`; never expose backend error fields.
- Health service version is captured from this service's package metadata at module/boot initialization, independent of caller environment and stable across requests; v1 version behavior is unchanged.
