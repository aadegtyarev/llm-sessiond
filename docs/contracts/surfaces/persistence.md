# Durable session persistence

## Ownership and schema

`llm-sessiond` owns a separate SQLite store; it does not open/import the native harnessd database. Generic schema contains no Pi/Claude columns:

```sql
sessions(id,harness_id,cwd,status,name,native_session_id,adapter_options,
 adapter_state,failure_reason,failed_at,created_at)
```

Only additive transactional migrations; `PRAGMA user_version`, WAL. Unknown newer/corrupt schema blocks startup. A cross-platform single-owner mechanism is required; SQLite locking alone does not guarantee only one process owner.

## Adapter checkpoint

`adapter_state={namespace,version,data:JsonValue}` is bounded (initial max 64 KiB), non-secret resume metadata, never prompts/history/credentials. Registered adapter validates, interprets, and may migrate versions; core validates generic bound/namespace only. Resume gets exact checkpoint; generic core does not require native ID for every harness. Claude's `claude.session` v1 data is only `{sessionId:UUID}` and does not promise an empty transcript can be resumed. Built-in adapters retain exact native-ID protections. Unknown adapter/version preserves record and fails explicitly, never changes harness. Launch/resume/options replacement may update checkpoint; optional writes are gated by current-instance generation so stale daemon instances cannot overwrite it.

## Startup and recovery

Startup reconciliation does not launch, resume, or replay. `running|starting` become stopped. `failed` with resumable state becomes stopped while preserving cause; other statuses remain. Resumability is adapter-declared. Live recovery drains events, marks unresolved InputIds uncertain once, and performs bounded exact resume attempts with 250 ms/1 s/4 s backoffs and 60 s stability reset where supported. Uncertain input is never replayed. No durable event history or replay guarantee.

## Shutdown and retention

Daemon: readiness off, begin close, invalidate guards/callbacks, bounded drain/stop/join owned instances, then close transports/store. Client shutdown/disconnect only detaches: it does not stop daemon sessions/processes. Hard crash does not prove OS descendants disappeared; no orphan-cleanup/reattach guarantee from rows.

Prepared-runtime HTTP discovery and the injected basic session cycle check the existing store owner generation and the runtime's synchronously recorded closing state. List/detail expose durable-row snapshots, not proof of a live native process; create reports the manager's actual persisted status and stop reports success only after confirmed cleanup. Injecting the runtime does not open a database, acquire an owner lock, change schema/recovery, or transfer store/runtime shutdown ownership to the HTTP server. Terminal shutdown closes create/resume admission before draining owned work; it does not claim cleanup for work that may still escape.

Store path precedence: `LLM_SESSIOND_STATE_DIR`, `$XDG_STATE_HOME/llm-sessiond`, then home state directory. POSIX private ownership/mode; Windows requires fully qualified drive/UNC path without claiming specific ACL behavior. Cwd is validated via daemon OS realpath/access; reject relative/drive-relative paths. Windows drive/UNC paths are not client-converted to POSIX/URI. Cwd is not a sandbox.

## Transient input runtime

Input commands and normalized state are runtime-only. No input body, input ID history, or pending command is added to the store; restart does not replay input. See [input runtime](input-runtime.md).

## Privacy and related surfaces

Options retain max 8192 bytes/depth 5 and secret-key restrictions. Do not persist/log prompt bodies, reasoning, credentials, raw errors or stacks. See [generic lifecycle](control-plane.md), [adapter checkpoint schemas](harness-adapters.md), [API limits](api-v2.md), and [v1 unchanged](api-v1.md).
