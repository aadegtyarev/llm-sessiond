# llm-sessiond

Standalone Node.js 24+ strict TypeScript ESM service owning Pi sessions and child-process lifecycle. It exposes loopback-only HTTP + WebSocket JSON API v1; state is in-memory.

## Run

```sh
npm install
npm run build
PI_EXECUTABLE=/path/to/pi npm start
```

On Windows PowerShell, set `$env:PI_EXECUTABLE = "C:\path\to\pi.exe"` before `npm start`.

The service binds to `127.0.0.1` (default port `4317`, configurable with `PORT`). `HOST` is rejected unless exactly `127.0.0.1`. Pi must support `--mode rpc`. `npm test`, `npm run typecheck`, and `npm run build` validate the service using a fake Pi executable.

The default `npm start` remains the in-memory v1 service. For the separate durable basic-v2 composition, run `npm run start:v2` after building; it also serves the existing v1 service and does not launch or resume sessions at boot. See [standalone daemon startup](docs/contracts/surfaces/daemon-startup.md) for configuration, readiness, and shutdown limits.

## API summary

HTTP routes: `GET /api/v1/health`, `GET /api/v1/harnesses`, `GET|POST /api/v1/sessions`, `GET /api/v1/sessions/:id`, `POST /api/v1/sessions/:id/inputs|cancel|stop|resume`. WebSocket events: `/api/v1/events` with optional `sessionId` filter. Exact schemas, bounds, errors, and event envelopes are specified in [API v1 contract](docs/contracts/surfaces/api-v1.md); lifecycle semantics are in [session lifecycle](docs/contracts/surfaces/session-lifecycle.md).

The default v1 composition has no TLS, bearer authentication, Unix sockets, durable state, restart recovery, Claude, or client migration. The opt-in v2 bootstrap remains loopback-only and does not provide bridge/events or full control-plane parity. Prompt bodies and stderr are never logged; uncertain inputs are not retried. See [ROADMAP.md](ROADMAP.md) and the [harnessd](docs/integration-harnessd.md) and [plasma-ai-assist](docs/integration-plasma-ai-assist.md) integration plans.

## License

This project is licensed under the [MIT License](LICENSE).
