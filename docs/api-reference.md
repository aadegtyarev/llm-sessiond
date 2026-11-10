# HTTP API: запросы и ошибки

[Запуск](local-daemon-api.md), [нормативная граница](contracts/surfaces/local-daemon-api.md).

## Транспорт

Адрес: `http://127.0.0.1:PORT`. Даже SSE требует ровно один `Authorization: Bearer <token>`: loopback не заменяет auth. Token — из [приватного config](daemon-config.md), не argv/env/URL/log.

POST требует JSON object и `Content-Type: application/json`, допустим `charset=utf-8`. Пустая операция требует `{}`. GET — без body/transfer-encoding. Query/fragment/percent-encoded paths/Origin отклоняются; CORS нет.

Чтение списка, config с фиксированным портом:

```sh
node --input-type=module - /path/to/config.json <<'JS'
import { readFileSync } from 'node:fs';
const { token, port = 3000 } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const r = await fetch(`http://127.0.0.1:${port}/sessions`, {
  headers: { Authorization: `Bearer ${token}` },
});
console.log(r.status, await r.json());
JS
```

## Маршруты

Успех — HTTP200, JSON результат без envelope; `/events` возвращает SSE.

| Метод и путь | Body → результат |
| --- | --- |
| POST `/sessions` | `{sessionId,harness?}` → created SessionView |
| GET `/sessions` | → SessionView[] |
| GET `/sessions/:sessionId` | → SessionView |
| POST `/sessions/:sessionId/start` | `{}` → SessionView; запускает Native CLI |
| POST `/sessions/:sessionId/command` | Native object с непустым string `type` → полный record или local written |
| POST `/sessions/:sessionId/compact` | `{}` / `{customInstructions:string}` → native compact response |
| POST `/sessions/:sessionId/reply` | QuestionReply → `{kind:written/rejected/unknown}` |
| POST `/sessions/:sessionId/stop` | `{}` → SessionView |
| POST `/shutdown` | `{}` → `{stoppedSessionIds,uncertainSessionIds,failedSessionIds}` |
| GET `/events` | → [ready/core frames](events.md) |

[Native payload, QuestionReply и результаты](native-commands.md). Command — только running без stop; Pi reply — также starting. Start имеет native startup/hook effects; bind/create не спавнят child. Shutdown закрывает admission, после cleanup — streams/listener; [unknown не all-cleaned](safety-and-validation.md#остановка).

## Сессии

ID: 1–128 ASCII `A-Z a-z 0-9 . _ -`, кроме ровно `.`/`..`; case-sensitive, допустимы `.leading`, `CON`, `--port`. `SessionView` — `{sessionId,status}`; только явный selector добавляет `harness`, включая `pi`. Get/list — локальные записи, не history/run status/idle process-liveness.

Create запрещает extra fields; `harness` — непустая строка. Неверная форма →400; неизвестный модуль →409 `harness-rejected` без записи/события/spawn. Модуль закреплён на весь lifecycle. [Состояния/cleanup](contracts/surfaces/session-core.md).

## Ошибки

Форма: `{"error":{"code":"…"}}`, без private exception.

| HTTP | Code |
| --- | --- |
| 400 | `transport`, `json`, `schema` |
| 401 | `auth`; также `WWW-Authenticate: Bearer` |
| 404 / 405 | `route` / `method` |
| 409 | `closed`, `duplicate-session`, `session-not-found`, `invalid-state`, `harness-rejected`, `harness-unknown` |
| 413 / 415 | `body-too-large` / `content-type` |
| 503 | `closed`, `stream-limit` |
| 500 | `internal` |

Pi `success:false`/Claude control error — полный HTTP200 response. Reply unknown/rejected — HTTP200, не доказательство доставки. Written не native acceptance.

## Пределы

Body ≤65536 bytes; headers ≤8192. Request timeout 15s, headers timeout 10s, не native response deadline. Malformed/oversize body отклоняется до Core. HTTP parser может закрыть канал или вернуть bare400/408 без JSON; transport failure не доказывает отсутствие command effect. Не повторяйте автоматически. [SSE limits](events.md#пределы), [transport](../src/daemon.ts), [schema](../src/daemon-schema.ts).
