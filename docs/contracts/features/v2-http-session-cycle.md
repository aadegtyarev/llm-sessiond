# Injected v2 HTTP basic session cycle

- Status: Approved derived slice, component A

## Goal and behavior

Add only the injected v2 HTTP basic session cycle (`POST /sessions`, `GET /sessions`, `GET /sessions/:sid`, `POST /sessions/:sid/stop`) while preserving default/v1 composition. Component A implements the terminal runtime shutdown admission prerequisite; integration is a separate slice.

## Scenarios

- The four existing normative routes use the same injected runtime and boot instance ID as health. Mutations require matching instance header before backend effects.
- Public `Session` is exactly the whitelist `id,harnessId,cwd,status,name?,nativeSessionId?,adapterOptions?,failureReason?,failedAt?`; never expose adapter state/checkpoints, creation time, owner/process data, or closures. IDs use exact case-sensitive `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`; UUID is not required.
- Create strictly accepts only normative fields `cwd,harnessId?,name?,adapterOptions?,confirmedDangerousOptions?,callbackConnectionId?`. Empty options/confirmation may mean no configuration; nonempty options/confirmation and any present callback ID are explicitly unsupported before creation/binding.
- `201` reports the actual durable manager state and preserves failure/uncertain metadata; it never invents running. `204` stop only follows manager-confirmed stop and cleanup. Durable metadata reads do not claim a native process is live. `features` stays empty.
- Mutations use the health route's existing boot instance identity and reject a mismatched `X-Llm-Sessiond-Instance` before backend effects; do not create another identity.
- Runtime shutdown closes create/resume admission synchronously, including calls still in async cwd validation, waiting for a per-session lock, or capturing execution methods.
- An execution admitted before closure remains owned and is drained or reported as unconfirmed; shutdown never claims successful cleanup while its launch/resume can escape.
- Existing stop and cleanup remain available after new-execution admission closes; failed cleanup remains retained for physical cleanup retry only.

## Non-goals

No HTTP/API implementation in component A, lifecycle intent coordinator, generic engine, owner/provider redesign, cancellation/replay framework, or changes to direct manager semantics outside terminal runtime shutdown. No wire/schema/default-config changes, broader v2 routes, WebSocket/events/client/bootstrap activation, or full v2 parity.

## Affected surfaces

- [Lifecycle](../surfaces/session-lifecycle.md)
- [Control plane](../surfaces/control-plane.md)
- [Persistence](../surfaces/persistence.md)
- [Harness adapters](../surfaces/harness-adapters.md)
- Compatibility: [API v1](../surfaces/api-v1.md), [API v2](../surfaces/api-v2.md), [bridge v2](../surfaces/bridge-v2.md)

## Constraints and acceptance

Use one minimal admission guard in existing lifecycle ownership. Fence new create and resume at synchronous terminal shutdown entry, after async preflight/lock waits, immediately before final launch/resume invocation after method/getter capture, and after async native results before publishing running. No late callback may start/reopen execution after closure. Stop/cleanup remains permitted. Do not claim confirmed cleanup if an admitted execution can still launch.

Acceptance: deterministic regression tests prove no post-close execution/row admission; already-admitted work is tracked; cleanup uncertainty is retained and retry cannot admit new execution. HTTP integration separately preserves opaque exact IDs, strict public whitelist/safe errors, no false liveness, and only confirmed stop success. Existing runtime shutdown behavior and direct manager behavior outside terminal close remain unchanged.

## Validation

Run focused lifecycle admission/shutdown tests, full Node 24 checks (test, typecheck, build, lint, format, version), production audit, package dry-run, diff check, authored-file line counts, and commit with clean tree.
