# Локальный daemon API

## Граница и владение

Внешний клиент без импорта TypeScript управляет сессиями через HTTP/JSON и SSE.
Один daemon владеет одним [SessionCore](session-core.md) и своим
[Native Pi harness](pi-text-harness.md); Pi владеет agent/model/tool loop.
TCP listener — только `127.0.0.1`, port настраивается. Нет remote bind, Unix socket/named pipe,
CORS, browser UI или auth-free health endpoint.
[Запуск и клиент](../../local-daemon-api.md); [CLI](../../../src/daemon-cli.ts),
[transport](../../../src/daemon.ts), [routes](../../../src/daemon-routes.ts).

## Конфигурация и readiness

Node 24 checkout CLI получает один JSON config через stdin до EOF, ≤65536 bytes:
`{token,port?,launch?}`. Token — 32–256 characters `A-Z a-z 0-9 _ -`, не argv/env/URL.
На каждом API запросе, включая SSE, обязателен `Authorization: Bearer <token>`;
loopback не заменяет auth. Config хранится приватно, на Windows с ограниченным ACL.
Port — integer 0–65535, default3000; 0 выбирает свободный. Launch — trusted operator
config: executable/prefixArgs/cwd/commandDeadlineMs/stopDeadlineMs по контракту Pi.
HTTP не принимает executable/config/raw RPC; права Native Pi не ограничены sandbox.
CLI stdout JSON `listening.host/port` подтверждает bind, SSE `ready` — только подписку.
Readiness Native Pi проверяется коррелированным get_state harness при start, не spawn/таймером.

## HTTP/JSON

POST требует JSON object и `Content-Type: application/json` (optional charset=utf-8);
GET без body. Query/fragment/percent-encoded paths и Origin отклоняются.
Успех — HTTP200 с результатом без envelope. Все POST body обязательны, включая `{}`.

| Метод и путь | Body → result |
| --- | --- |
| POST `/sessions` | `{sessionId}` → SessionView |
| GET `/sessions` | → SessionView[] |
| GET `/sessions/:sessionId` | → SessionView |
| POST `/sessions/:sessionId/start` | `{}` → SessionView |
| POST `/sessions/:sessionId/send` | `{inputId,text}` → InputView |
| POST `/sessions/:sessionId/reply` | QuestionReply → `{kind: written/rejected/unknown}` |
| POST `/sessions/:sessionId/stop` | `{}` → SessionView |
| POST `/shutdown` | `{}` → `{stoppedSessionIds,uncertainSessionIds,failedSessionIds}` |
| GET `/events` | SSE ready/core frames |

Session/input IDs: 1–128 ASCII `A-Z a-z 0-9 . _ -`. Только для sessionId исключены
ровно `.`/`..` (URL dot-segments); другие dot-containing IDs и dot input IDs допустимы.
[DTO](../../../src/types.ts): SessionView содержит sessionId/status/input либо null;
InputView — inputId/status. Reply: opaque непустой requestId, method confirm/select/input,
confirmed:boolean для confirm, value:string для select/input либо cancelled:true вместо
ответа; extra fields отклоняются. Отдельного length cap requestId нет; body limit действует.
HTTP ACK не settlement: pending/unknown блокируют следующий send. Reply written — только
local write, не native receipt/consumption; replies не создают input и не завершают его.

## Ошибки и конечные пределы

JSON ошибки: `{"error":{"code":"…"}}`. HTTP401 auth; 400 transport/json/schema;
413 body-too-large; 415 content-type; 404 route; 405 method; 503 closed/stream-limit;
500 internal без private exception. CoreError даёт409 и безопасный code: closed,
duplicate-session/session-not-found/invalid-state/input-in-flight/duplicate-input/
harness-rejected/harness-unknown. HTTP200 с unknown не подтверждает успешный исход.
Malformed/oversize body отклоняется до Core. Request body ≤65536 bytes, headers ≤8192;
request timeout15s, headers timeout10s. HTTP parser может закрыть неполный канал или
вернуть bare400/408; transport failure не доказывает отсутствие command effect.
Не более32SSE streams; на stream ≤256 ожидающих frames, byte budget1048576 с учётом
Node writable buffer и следующего frame. Overflow/oversize event закрывает stream,
без silent drop/truncate. Медленный stream не блокирует Core и другого consumer.

## SSE и идентичность

Сначала GET/events и `event: ready` с `data: {}`, затем create/start: startup question
может прийти до HTTP start ACK. Подписка установлена до ready; дальше `event: core`,
`data: <CoreEvent>` и пустая строка. Все6типов: session/input/text/tool/question/notification.
Порядок FIFO и source/generation gating сохраняются по Core. Session/native IDs
передаются точно; text/tool/question/notification session-scoped, без выдуманной
input correlation. Публичные JSON snapshots не дают mutable доступа к Core records.
Нет истории, SSE IDs, replay/resume или восстановления полноты после stream loss.

## Разрыв связи и shutdown

Disconnect не отменяет и не повторяет команду, не доказывает остановку сессии.
После потери потока доступны current-state get/list и explicit stop до shutdown;
автоматического retry/replay нет. Get не обещает idle native process-liveness.
Shutdown сразу прекращает admission, использует existing Core cleanup, возвращает
честную сводку, затем закрывает streams/listener. SIGINT/SIGTERM используют тот же cleanup.
Unknown не all-cleaned: owned child может остаться жив; выход daemon в этом случае
не гарантируется. Stopped подтверждается наблюдённым exit/close owned child либо
локально для created по контракту Core; kill return/EOF/timeout не доказательства.

## Privacy, права и ограничения

Token не логируется/не публикуется/не наследуется Native Pi через startup config.
Private exceptions/config/raw RPC/stderr не идут в API. Явный display text может
содержать чувствительные данные: secret filtering не обещан. Native tools сохраняют
права child. Нет sandbox, descendant/remote cleanup guarantees, deployment/service
installation, SDK, permissions engine, catalog/model management, persistence/recovery,
UI/harnessd/Telegram/ClaudeCode или generic executable gateway.

## Проверенная platform boundary

Один HTTP/SSE external-client fake-native smoke проверен на Linux и actual Windows CI.
Full suite и bounded real Native Pi scenario проверены на Linux. Это не full Native Pi/old
full-suite Windows certification, provider/auth, native cancellation/timeout или remote cleanup гарантия.
