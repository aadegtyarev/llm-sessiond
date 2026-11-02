# Pi standalone effort mutation

- Status: Approved; implementation milestone B

## Goal

Implement the standalone backend `effort.change` operation for currently owned running sessions, with Pi as the only built-in adapter. Keep the RPC pre-write seam private; no HTTP/WS wiring is part of this slice.

## Scenarios and constraints

- An optional synchronous pre-write callback is separate from RPC arguments and wire DTO.
- Capture and serialize adapter-controlled arguments, writer method, and receiver before the final callback. Invoke the captured writer with its original receiver immediately after the callback, with no later untrusted getter or serialization.
- A callback refusal or throw abandons only its correlated pending RPC and timer; it does not fail the link or disturb unrelated RPCs or active input. A late reply is ignored. No retry.
- Core accepts any exact string level, without trimming, a closed enum, or a new length cap. It requires the open `effort.change` capability; third-party adapters need neither Pi knowledge nor `effort.read`.
- Pi freshly queries native effort levels and `get_state`; unsupported exact levels cause no setter write. It issues at most one `{type:"set_thinking_level",level}` write without persistence options.
- Setter ACK is not proof of requested state. Success requires fresh readback of matching native session ID and exact thinking level. Every possible setter write followed by error, timeout, rejection, malformed ACK, or failed readback is `unknown`, never retried.
- The manager uses a bounded 30-second operation lifetime and synchronous owner/source/generation/liveness/pending/stop-intent fences before RPCs and at the actual mutation write boundary. It does not hold a lifecycle lock during RPC.
- Safe result/error metadata distinguishes `applied`, `not-applied`, and `unknown`; native errors and causes are never forwarded. Preserve unrelated active input and shared link state.
- Existing RPC callers, input/images/cancel/status/catalog behavior, record bounds, and the single reader remain unchanged.

## Non-goals

No HTTP/WS route, bridge broker/guard, model mutation, other controls/options/commands, Claude, DB/schema, API v1, production settings/default change, automatic retry, queue, or generic dispatch framework. No real native setter test unless production settings isolation is proven; fake-native tests are acceptable.

## Affected surfaces

- [Control plane](../surfaces/control-plane.md)
- [Harness adapters](../surfaces/harness-adapters.md)
- [Session lifecycle](../surfaces/session-lifecycle.md)
- [API v2](../surfaces/api-v2.md)
- Compatibility unchanged: [input runtime](../surfaces/input-runtime.md), [API v1](../surfaces/api-v1.md), [persistence](../surfaces/persistence.md)

## Acceptance criteria

- Generic manager routes exact string levels through an optional typed execution port for a running owned session, without resume, input coupling, Pi cases, or an `effort.read` requirement.
- Pi prevalidates catalog and native identity, writes at most one setter, and reports applied only after exact readback; all post-write ambiguity is unknown.
- Deterministic fake tests cover capability and custom-level parity, unsupported levels, ACK/readback paths, fences, deadline expiry, stop/source changes, and input concurrency.
- Existing private RPC seam remains backward compatible. Full tests, typecheck, build, lint, format, version, production audit, pack dry-run, diff, and cumulative line-count gates pass.
- No production setter is run unless configuration isolation is proven; whole feature remains pending review.
