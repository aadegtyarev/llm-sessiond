# Pi standalone effort mutation

- Status: Approved; private implementation milestone A only

## Goal

Provide the private Pi RPC write-boundary seam needed for a later standalone effort mutation. This milestone does not implement or advertise effort mutation.

## Scenarios and constraints

- An optional synchronous pre-write callback is separate from RPC arguments and wire DTO.
- Capture and serialize adapter-controlled arguments, writer method, and receiver before the final callback. Invoke the captured writer with its original receiver immediately after the callback, with no later untrusted getter or serialization.
- A callback refusal or throw abandons only its correlated pending RPC and timer; it does not fail the link or disturb unrelated RPCs or active input. A late reply is ignored. No retry.
- Once the captured write is invoked, retain existing uncertain/terminal failure semantics; never report definite non-application.
- Existing RPC callers, input/images/cancel/status/catalog behavior, record bounds, and the single reader remain unchanged.
- Preserve safe error handling: do not forward or log native errors, prompts, credentials, causes, or stacks.

## Non-goals

No effort mutation port, catalog validation, advertisement, HTTP/WS route, bridge broker/guard, setter/default/config change, model mutation, other controls/options/commands, Claude, DB, API v1, queues, retries, or framework.

## Affected surfaces

- [Control plane](../surfaces/control-plane.md)
- [Harness adapters](../surfaces/harness-adapters.md)
- [Session lifecycle](../surfaces/session-lifecycle.md)
- [API v2](../surfaces/api-v2.md)
- Compatibility unchanged: [input runtime](../surfaces/input-runtime.md), [API v1](../surfaces/api-v1.md), [persistence](../surfaces/persistence.md)

## Acceptance criteria

- RPC API remains wire-compatible and its existing timeout default/callers remain compatible.
- Tests cover argument/getter reentrancy before fence, preserved receiver, refusal/throw with zero write, timer cleanup, ignored late reply, next RPC success, unrelated pending RPC and input survival, and uncertainty when actual write fails.
- Focused tests and full existing test/typecheck/build/lint/format/version/diff/line-count gates pass.
- This private milestone is ready for the next feature worker; whole effort feature is not complete.
