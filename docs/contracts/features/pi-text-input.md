# Pi text input and settlement

- Status: Approved; implementation in progress
- Based on: `docs/contracts/features/control-plane-v2.md`

## Goal

Expose the existing generic durable input port on Pi v2 lifecycle executions for text-only submission and normalized settlement. Preserve Pi v1 behavior and all existing core ownership boundaries.

## Scenarios

- Launch and exact-resume keep one live RPC reader from correlated `get_state` readiness through prompt and event processing.
- Submit the daemon-assigned opaque input ID and exact text once using Pi `prompt` with `streamingBehavior:"steer"`; correlated success is accepted, correlated explicit false is `prompt_rejected`, and ambiguous delivery is uncertain without replay.
- `agent_settled` completes only the matching current input under the existing single-active-input turn rule. Events before acknowledgement and late acknowledgements cannot mutate a newer input.
- Unsupported images and cancellation fail explicitly before side effects; images are also rejected at the adapter boundary.
- Process/stream failure and stop fence writes, settle uncertainty safely, and retain ownership until exit is confirmed.
- Generic manager composition, stopped exact autoresume, and observer/source fences remain intact.

## Non-goals

Images, cancellation, status/models/effort/options/reload/commands, rich output/events/callbacks, transport/API/Claude/harnessd/main/DB/v1 changes, and generic coordinator architecture. Required cancel port explicitly rejects unsupported. No input IDs are generated, translated, or synthesized by Pi.

## Affected surfaces

- [Input runtime](../surfaces/input-runtime.md)
- [Harness adapters](../surfaces/harness-adapters.md)
- [Session lifecycle](../surfaces/session-lifecycle.md)
- [Generic control plane](../surfaces/control-plane.md)
- [Persistence](../surfaces/persistence.md)
- [API v1](../surfaces/api-v1.md)
- [API v2](../surfaces/api-v2.md)
- [Bridge events](../surfaces/bridge-events.md)

## Interfaces and constraints

Advertise only `input.submit` for Pi v2 in addition to existing lifecycle capabilities, only when executable. Preserve v1 startup/adapter semantics and exact checkpoint/resume hooks. Keep the optional inputs port available before launch, including idle execution-ended and stop-before-start. Never log or persist prompt bodies, raw RPC records/errors, reasoning, causes, or stacks. Stop is bounded, retryable, and successful only when child exit is confirmed.

## Acceptance and validation

Deterministic fake-RPC tests cover correlation, exact ID/text/steering once, settlement ordering, all ambiguous/rejected outcomes, terminal and malformed streams, pipe/child errors, stop/retry/ownership, lifecycle-wide subscriptions, image/cancel preflight, and v1 regression. Run focused and full Node 24 tests, typecheck, build, lint, format, version, production audit, pack, diff checks, and authored-file line-count checks.
