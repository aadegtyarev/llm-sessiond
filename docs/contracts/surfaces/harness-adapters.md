# Harness adapter registry

## Boundary

The composition root injects `HarnessAdapter` implementations into a generic registry. Pi/Claude are built-in composition choices, not core/API cases. A third-party harness must not require core, route, DB-column, or closed DTO-union changes. The daemon client uses generic descriptors/standard DTOs without Pi/Claude branches.

## Registration and extension schemas

Each registered adapter supplies generic descriptor `{id,aliases,capabilities,metadata?,options?,extensions?}` and strict validators for extension request/result/event/checkpoint plus safe-error mapping. Advertised capabilities are an honest subset of standard launch/stop/resume, submit/images/cancel, status/usage, models/effort, options, commands, reload, file-send and permission callbacks. Pi v2 advertises `status.read` and `usage.read` and projects its correlated live state/statistics to the standard `LiveStatus`; it alone also advertises `models.read`, querying `get_available_models` through its existing correlated RPC reader and projecting only standard model fields. Pi alone advertises `effort.read`; it queries `get_available_thinking_levels` through that same reader and projects only validated standard effort strings, omitting unreported `current`. Pi alone advertises `effort.change` through its typed durable execution port; it validates an exact requested string against a fresh native catalog and native-session state, sends at most one `set_thinking_level` request without persistence options, then confirms exact application with a fresh native-session/state readback. A setter ACK alone is insufficient; all possible-write failures or readback mismatches are unknown and never retried. This operation uses the existing correlated reader and private final-write fence, not a raw-RPC or generic control bus. Other adapters remain unchanged. Pi alone also advertises `commands.read`; it queries native `get_commands` through that reader and exposes only `source === "extension"` entries with names matching `^[a-z][a-z0-9_-]{0,31}$`, excluding `reload`. It preserves eligible names, descriptions, order, and empty catalogs; absent descriptions become `""`, and unrelated native metadata is dropped. Claude and other adapters remain unchanged. Clients retain standard session operations when a namespaced presentation is unsupported. Generic executions may expose the transient input port described in [input runtime](input-runtime.md); Pi v2 advertises text/image submit plus `input.cancel` and `input.cancel-current`. Cancellation is exact-current only and does not treat abort acknowledgement as input settlement.

When a standard capability is insufficient, extension descriptor is `{namespace,version,operations:[{name,effect:"read"|"write",guardRequired:boolean}],events:string[]}`. Request/result are `{version,input:JsonValue}` and `{version,output:JsonValue}`. Dispatch resolves only a registered validator/handler, never a user-controlled dynamic method. HTTP `POST /api/v2/sessions/:sid/extensions/:namespace/:operation` handles non-guarded calls; guarded writes use bridge `control.request`. Event shape is `{kind:"extension",namespace,version,name,data}`. Unknown namespace/version/operation fails explicitly. No raw-RPC/process-command passthrough.

Namespaced values remain versioned and strict. Generic core validates namespace and size but does not parse adapter data. Generic clients preserve payloads without coercion; specialized UI projection is optional and separate.

## Built-in Claude lifecycle

Claude is registered as `claude-code` (alias `claude`) with launch, resume, stop, and text-only `input.submit` capabilities. Images and cancellation are unsupported. Its `claude.session` v1 checkpoint contains exactly `{sessionId:UUID}`. Resume preserves exact UUID spelling and fails closed on malformed/unknown state, missing transcript, or a saved native-ID mismatch. The private initialize handshake sends no prompt and is not a public protocol/raw-control capability. Text is sent once as one native stream-json user message; the daemon input ID remains local. Only an exact matching root user replay confirms delivery, and only a subsequent matching root result settles it. Correlation relies on one active input and native ordered replay/result delivery, not optional upstream UUIDs. No prompt or transcript data is stored.

## Checkpoints and errors

Persist adapter resume metadata as `{namespace,version,data:JsonValue}`; adapter owns validation, interpretation, and version migration hook. Core enforces generic bounds and supplies exact checkpoint to registered adapter. Missing adapter or unknown checkpoint version preserves record and fails explicit; never switches harness. See [persistence](persistence.md).

Adapter error mapping returns only registered safe `{namespace,version,code}`. Raw messages, causes, stacks, prompts, reasoning, RPC payloads, and protocol-specific error enums are forbidden in core/API. Unknown failures map to generic `OPERATION_FAILED`; HTTP/error envelope is in [API v2](api-v2.md).

## Non-goals

No protocol dialect in core, no harness-specific DB fields/DTO unions/routes, no implicit capability additions, and no arbitrary extension code or unvalidated payload passthrough.
