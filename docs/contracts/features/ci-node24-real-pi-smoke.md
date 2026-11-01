# CI Node 24 and real Pi smoke

## Status

Approved; implementation and validation complete, retained for independent review.

## Goal

Use current Node 24-native GitHub Actions releases without changing CI triggers, gates, permissions, token/comment settings, or behavior. Validate supported Linux behavior with real Pi 1.0.4.

## Scenarios

- CI checks and full-history secret scanning run with the approved current action releases.
- Local Node v24.21.0 gates pass.
- A built service is exercised with real Pi through session creation, WebSocket events, normal input, cancellation and reuse, uncertain stop, resume preserving the native session ID, and graceful shutdown.
- Service-owned Pi children are cleaned up; captured service logs do not contain the exact prompt marker.

## Non-goals

Windows, npm publish, deployment, runtime/API changes, smoke harness committed to the repository, push, PR, merge, tag, or release. Runtime defects discovered in smoke are reported, not modified.

## Affected surfaces

- [JSON API v1](../surfaces/api-v1.md)
- [Session and Pi process lifecycle](../surfaces/session-lifecycle.md)

## Interfaces and constraints

Only `.github/workflows/ci.yml` action references change: checkout v7.0.1, setup-node v7.1.0, and gitleaks-action v3.0.0. Preserve all other workflow behavior. Pi smoke uses the configured real Pi executable, a built service, loopback port, temporary cwd, bounded timeouts, and guaranteed cleanup. Prompt contents and raw logs are not reported.

## Acceptance

- Feature contract and focused workflow change are committed separately.
- All requested Node 24.21.0 gates, production audit, whitespace check, authored-file line limit, and full-history plus archived-HEAD gitleaks checks pass.
- All specified real Pi smoke scenarios pass and cleanup is evidenced; any runtime defect or bounded timing failure is reported as a blocker.
- Final tree is clean apart from the two task commits; feature contract is retained for independent review.

## Validation

Run the complete project CI gate set on Node v24.21.0, gitleaks on full history and archived HEAD, and the bounded real Pi smoke. Do not run Windows.
