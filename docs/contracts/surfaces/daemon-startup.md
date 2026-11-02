# Standalone daemon startup

## Boundary and operators

`npm run start:v2` opts into a durable standalone composition of the existing API v2 slice and the real API v1 service. Default `npm start` (`src/main.ts`) remains the in-memory v1 composition. This is not full daemon-mode, bridge, or application-integration readiness.

Build with `npm run build`; then run the v2 entrypoint explicitly. No session, native process, or model turn starts during boot. A native process is started only by an explicit session operation.

## Command and configuration

```sh
npm run build
LLM_SESSIOND_STATE_DIR=/tmp/llm-sessiond-v2-dev PORT=4318 npm run start:v2
```

`HOST` may be omitted or must equal `127.0.0.1`; no other bind address is accepted. `PORT` defaults to `4317` and accepts unsigned decimal integers from `0` through `65535` (`0` asks the OS for an available port). State directory precedence is `LLM_SESSIOND_STATE_DIR`, `$XDG_STATE_HOME/llm-sessiond`, then `.local/state/llm-sessiond` under Node's user-home directory. The SQLite file is `sessions.sqlite3` inside that directory.

## Startup and readiness

Startup validates the host and port, prepares a canonical private state directory, acquires `owner.lock`, then opens/migrates the database and claims its generation. Only then does it compose the session store, real v1 service, built-in Pi/Claude durable runtime, and existing HTTP server. Discovery advertises API versions v1 and v2. The basic v2 HTTP slice is health, harness discovery, and four session routes: create, list, detail, and stop. `features` remains empty.

Existing rows are reconciled without launching, resuming, or replaying sessions. Health/readiness confirms the service, current store owner, and non-closing runtime; it does not probe SDK credentials, start a native child, or prove model availability. V2 routes and their limits are specified in [API v2](api-v2.md); the default v1 composition remains unchanged ([API v1](api-v1.md)).

## Shutdown and failures

Shutdown closes readiness/admission synchronously. Owned Pi and Claude providers must confirm their bounded drain; HTTP listener/admissions close and tracked idle or upgraded sockets are destroyed. Only after drains and transport cleanup succeed does shutdown revoke the generation, close SQLite, and release the owner lock. Repeated signals/close calls share shutdown and do not double-release.

Failures before a database handle is acquired release only this startup's lock. Initialization/migration failure releases it only after database close is confirmed. Unconfirmed database close, provider drain, or transport cleanup fails nonzero and retains ownership lock; diagnostics are controlled and omit raw errors. No stale/dead-PID lock is reclaimed automatically. See [persistence](persistence.md) for schema and recovery semantics and [session lifecycle](session-lifecycle.md) for process ownership.

## Security and limits

Networking is localhost TCP only, fixed to `127.0.0.1`; there is no TLS, bearer authentication, or non-loopback bind. POSIX state directories are canonical, owner-checked, and private. Windows paths use existing drive/UNC validation; this contract makes no ACL-verification claim. Prompt bodies, raw backend messages, causes, and stacks are not logged. This bootstrap does not wire the v2 bridge/events, remaining lifecycle/query/control routes, or full control-plane parity.

## Related surfaces

See [persistence](persistence.md), [session lifecycle](session-lifecycle.md), [API v2](api-v2.md), and [API v1](api-v1.md).
