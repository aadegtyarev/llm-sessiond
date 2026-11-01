# JSON API v2

## Boundary and compatibility

`llm-sessiond` exposes loopback HTTP JSON API v2 to local clients. V2 is transport-neutral for registered harnesses. Existing v1 routes, schemas, identifiers, limits, and behavior remain unchanged; see [API v1](api-v1.md).

## Negotiation and identity

`GET /api/v2/health` returns `{apiVersion:"v2",protocolRevision:1,status:"ready",serviceVersion,instanceId,supportedApiVersions:["v1","v2"],features}`. Mutations require matching `X-Llm-Sessiond-Instance`; `X-Request-Id` is correlation only, never an idempotency key. Redirect, retry, and replay are forbidden. IDs are authoritative opaque case-sensitive strings; session/input IDs use `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`. UUID is current generation only. A new daemon boot has a new instance ID.

## HTTP resources

All paths below are relative to `/api/v2`. Schemas are strict: unknown fields reject; optional absent fields remain omitted unless explicitly cleared.

| Request                                                                                                  | Success                                                                      |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /harnesses`, `/sessions`                                                                            | `200 {defaultHarnessId,harnesses}`; `200 {sessions}`                         |
| `POST /sessions {cwd,harnessId?,name?,adapterOptions?,confirmedDangerousOptions?,callbackConnectionId?}` | `201 {session,bindingId?}`                                                   |
| `GET /sessions/:sid`                                                                                     | `200 {session}`                                                              |
| `PATCH /sessions/:sid {name:nullable string}`                                                            | `200 {session}`; null clears name                                            |
| `DELETE /sessions/:sid`, `POST /sessions/:sid/stop {}`                                                   | `204`; delete only stopped/unowned; stop after cleanup                       |
| `POST /sessions/:sid/resume {}`                                                                          | `200 {session}`                                                              |
| `POST /sessions/:sid/inputs {text,images?:[{mimeType,data}]}`                                            | `202 {inputId,resumed:boolean}`                                              |
| `POST /sessions/:sid/inputs/:iid/cancel {}`, `POST /sessions/:sid/cancel-current {}`                     | `204`, exact/current input only                                              |
| `GET /sessions/:sid/status`, `/models`, `/efforts`, `/options`, `/commands`                              | `200 Status`, `ModelCatalog`, `EffortCatalog`, `OptionCatalog`, `{commands}` |
| `POST /sessions/:sid/model {provider,modelId,effort?}`                                                   | `200 {model,effort?,effortConfirmed?}`, including partial model success      |
| `POST /sessions/:sid/effort {level}`                                                                     | `204`                                                                        |
| `PATCH /sessions/:sid/options {set?,resetKeys?,confirmedDangerous?}`                                     | `200 {session}`; reset uses keys, not sentinel values                        |

Reload, command execution, and guard-required extension writes use the [bridge](bridge-v2.md), not alternate HTTP routes. A stopped-session submit resumes exact adapter state, submits once, and reports `resumed:true` even if submit then fails. HTTP response loss is uncertain, never proof of no side effect. Missing session is 404.

## Errors, bounds, privacy

Safe errors are strict `{code,message,category,outcome,reference,inputId?,failure?,resumed?:true,adapterError?}`. `failure` is strict `{reason,text?}` with reason `prompt_rejected|hold_timeout|held_and_stopped|canceled`; `adapterError` is `{namespace,version,code}`. Categories: validation, not-found, unsupported, conflict, unavailable, uncertain, internal; outcomes: not-applied, applied, unknown. Mapping: 400 validation, 404 absent, 409 unsupported/conflict/guard/uncertainty, 413 limit, 503 unavailable/closing/instance-changed, 500 safe internal. Raw messages, causes, stacks, prompts, and reasoning are not serialized/logged.

Initial v2 bounds: HTTP JSON 24 MiB, UTF-8 text 256 KiB, decoded images 20 MiB canonical base64; WS frame 1 MiB and queue/buffer 4 MiB; options retain 8192 bytes/depth 5 and secret-key restrictions; checkpoints 64 KiB. Oversize fails explicitly, never truncates. Executable bounds and data classes are in [persistence](persistence.md) and [bridge](bridge-v2.md).

## Related surfaces

See [control plane](control-plane.md), [adapter extensions](harness-adapters.md), and [API v1](api-v1.md).
