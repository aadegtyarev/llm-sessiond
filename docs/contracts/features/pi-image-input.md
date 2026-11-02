# Pi durable image input

- Status: Approved
- Based on: `docs/contracts/features/control-plane-v2.md`

## Goal

Extend accepted Pi v2 durable text submission to support canonical image-bearing inputs and fix safe generic validation of canonical images at the decoded-size limit.

## Scope

- Exact text plus canonical image data becomes one Pi `prompt` with native image blocks; omitted/empty images preserve the text wire shape.
- Add only Pi capability `input.submit-images`; cancellation remains unsupported.
- Generic image validation accepts 20 MiB decoded aggregate and safely rejects over-limit/malformed data before resume or write.

## Non-goals

No changes to Pi v1, API/transport, DB/persistence schema, Claude, main, harnessd, cancellation, output events, controls, or generic coordinator architecture.

## Affected surfaces

- [Input runtime](../surfaces/input-runtime.md)
- [Harness adapters](../surfaces/harness-adapters.md)
- [Session lifecycle](../surfaces/session-lifecycle.md)
- [Generic control plane](../surfaces/control-plane.md)
- [Persistence](../surfaces/persistence.md)
- [API v1](../surfaces/api-v1.md)
- [API v2](../surfaces/api-v2.md)

## Constraints and validation

Preserve canonical Base64, exact values, existing text/ACK/settlement/stop/ID behavior, and the 24 MiB HTTP body limit. Reject invalid images before autoresume or RPC writes. No re-encoding, replay, raw prompt logging, or large fixture files.

Tests cover exact and over-limit decoded aggregate boundaries, malformed canonical Base64, exact Pi image/text wire payload, omitted image fields, stopped exact autoresume, preflight side-effect absence, and unchanged cancellation behavior. Run focused tests and full Node 24 tests/typecheck/build/lint/format/version/audit/pack/diff/line checks.
