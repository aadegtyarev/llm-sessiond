# Harness adapter registry

## Boundary

The composition root injects `HarnessAdapter` implementations into a generic registry. Pi/Claude are built-in composition choices, not core/API cases. A third-party harness must not require core, route, DB-column, or closed DTO-union changes. The daemon client uses generic descriptors/standard DTOs without Pi/Claude branches.

## Registration and extension schemas

Each registered adapter supplies generic descriptor `{id,aliases,capabilities,metadata?,options?,extensions?}` and strict validators for extension request/result/event/checkpoint plus safe-error mapping. Advertised capabilities are an honest subset of standard launch/stop/resume, submit/images/cancel, status/usage, models/effort, options, commands, reload, file-send and permission callbacks. Clients retain standard session operations when a namespaced presentation is unsupported. Generic executions may expose the transient input port described in [input runtime](input-runtime.md); Pi v2 advertises text submit only, while images and cancel remain unsupported.

When a standard capability is insufficient, extension descriptor is `{namespace,version,operations:[{name,effect:"read"|"write",guardRequired:boolean}],events:string[]}`. Request/result are `{version,input:JsonValue}` and `{version,output:JsonValue}`. Dispatch resolves only a registered validator/handler, never a user-controlled dynamic method. HTTP `POST /api/v2/sessions/:sid/extensions/:namespace/:operation` handles non-guarded calls; guarded writes use bridge `control.request`. Event shape is `{kind:"extension",namespace,version,name,data}`. Unknown namespace/version/operation fails explicitly. No raw-RPC/process-command passthrough.

Namespaced values remain versioned and strict. Generic core validates namespace and size but does not parse adapter data. Generic clients preserve payloads without coercion; specialized UI projection is optional and separate.

## Built-in Claude lifecycle

Claude is registered as `claude-code` (alias `claude`) with only launch, resume, and stop capabilities in this stage. Its `claude.session` v1 checkpoint contains exactly `{sessionId:UUID}`. Resume preserves exact UUID spelling and fails closed on malformed/unknown state or a saved native-ID mismatch. The adapter's private initialize handshake is not a public protocol/raw-control capability; no prompt or transcript data is stored.

## Checkpoints and errors

Persist adapter resume metadata as `{namespace,version,data:JsonValue}`; adapter owns validation, interpretation, and version migration hook. Core enforces generic bounds and supplies exact checkpoint to registered adapter. Missing adapter or unknown checkpoint version preserves record and fails explicit; never switches harness. See [persistence](persistence.md).

Adapter error mapping returns only registered safe `{namespace,version,code}`. Raw messages, causes, stacks, prompts, reasoning, RPC payloads, and protocol-specific error enums are forbidden in core/API. Unknown failures map to generic `OPERATION_FAILED`; HTTP/error envelope is in [API v2](api-v2.md).

## Non-goals

No protocol dialect in core, no harness-specific DB fields/DTO unions/routes, no implicit capability additions, and no arbitrary extension code or unvalidated payload passthrough.
