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
config: executable/prefixArgs/cwd/stopDeadlineMs по контракту Pi. HTTP не меняет launch
config/executable; команды — Native RPC data, не generic executable gateway.
Pi tools работают с правами child, не sandbox. Старые `stateDir/nativeSessionDir` и
`commandDeadlineMs` больше не config: неизвестные поля отклоняются до эффектов.

CLI stdout `listening.host/port` подтверждает bind, SSE `ready` — подписку.
Start требует correlated successful `get_state` с object data; spawn/таймер не readiness.
По умолчанию запуск — `--mode rpc`, без forced session flags/private extensions.
Локальные записи только в памяти, после restart список пуст. Pi владеет history/files/
persistence/transitions; daemon не читает, не мигрирует и не удаляет старые native
files/metadata/locks. Нет registry/locks, import/delete или startup settings restoration.
Listener startup failure закрывает Core/listener; чужие процессы не принимаются под управление.

## HTTP/JSON

POST требует JSON object и `Content-Type: application/json` (optional charset=utf-8);
GET без body. Query/fragment/percent-encoded paths и Origin отклоняются.
Успех — HTTP200 с результатом без envelope. Все POST body обязательны, включая `{}`.

| Метод и путь | Body → result |
| --- | --- |
| POST `/sessions` | `{sessionId}` → local created SessionView |
| GET `/sessions` | → local SessionView[] |
| GET `/sessions/:sessionId` | → local SessionView |
| POST `/sessions/:sessionId/start` | `{}` → SessionView; только created |
| POST `/sessions/:sessionId/command` | native object с непустым `type` → полный Native response |
| POST `/sessions/:sessionId/compact` | строго `{}` либо `{customInstructions:string}` → тот же command |
| POST `/sessions/:sessionId/reply` | QuestionReply → `{kind: written/rejected/unknown}` |
| POST `/sessions/:sessionId/stop` | `{}` → SessionView; только observed owned exit/close подтверждает stop |
| POST `/shutdown` | `{}` → `{stoppedSessionIds,uncertainSessionIds,failedSessionIds}` |
| GET `/events` | SSE ready/core frames |

Session IDs: 1–128 ASCII `A-Z a-z 0-9 . _ -`, кроме ровно `.`/`..` (URL dot-segments).
Case-sensitive `Foo/foo`, `.leading`, `CON` и length128 остаются адресуемыми.
[SessionView](../../../src/types.ts) содержит только `sessionId/status`, не input/run/history.
QuestionReply: opaque непустой requestId, method confirm/select/input, confirmed:boolean
для confirm, value:string для select/input либо cancelled:true вместо ответа; extra fields
отклоняются. Отдельного length cap requestId нет; body limit действует. `written` — только
local callback + drain stdin, не Native ACK/receipt/consumption. Штатное отсутствие ACK
не даёт harness-unknown. Shape/маршрут проверяются локально; expiry/options решает Pi.

### Native команды и полные ответы

`/command` передаёт объект без wrapper envelope, например
`{"type":"prompt","message":"Привет","streamingBehavior":"followUp"}`.
Клиент выбирает streamingBehavior; default не добавляется. Адаптер генерирует свой RPC id.
Native type/параметры передаются без allowlist, file/domain guards, settings mirror,
своей очереди или автоматических post-command proofs. Локальные access/lifecycle и
transport/schema validation сохраняются; command доступен только в running без stop.

Полный response сохраняет `id/type/command/success/data` либо `error` и все optional
поля. Например compact сохраняет summary/firstKeptEntryId/tokensBefore и предоставленные
estimatedTokensAfter/usage/details. Native `success:false` остаётся HTTP200 с полным
response. Unsupported compact адаптера — HTTP409 harness-rejected; физически потерянный
ожидаемый response — HTTP409 harness-unknown, не invented Native error.

`/compact` строго проверяет тело и вызывает тот же Core.command с native type compact.
Busy/queued/handled/started/refusal определяет Pi. Несколько pending RPC допускаются;
ответы коррелируются по id, не FIFO. Нет response-wait deadline, wait-triggered abort,
restart/retry или глобальной сериализации ожидания: abort/UI reply доступны при долгом
compact. Промежуточные/tool/agent события не завершают RPC/run. Native Pi 1.5 compact
начинает с await abort() и не продолжает прерванный run.

Legacy send/cancel/model/settings/reload/history URLs и Core methods не сохраняются.
Если операции нет в Pi RPC, daemon не эмулирует её через private helper/SDK.

## Ошибки и конечные пределы

JSON ошибки: `{"error":{"code":"…"}}`. HTTP401 auth; 400 transport/json/schema;
413 body-too-large; 415 content-type; 404 route; 405 method; 503 closed/stream-limit;
500 internal без private exception. CoreError даёт409 и безопасный code: closed,
duplicate-session/session-not-found/invalid-state/harness-rejected/harness-unknown.
HTTP200 reply unknown не подтверждает доставку; Native success:false остаётся product response.
Malformed/oversize body отклоняется до Core. Request body ≤65536 bytes, headers ≤8192;
request timeout15s, headers timeout10s. HTTP parser может закрыть неполный канал или
вернуть bare400/408; transport failure не доказывает отсутствие command effect.
Не более32SSE streams; на stream ≤256 ожидающих frames, byte budget1048576 с учётом
Node writable buffer и следующего frame. Overflow/oversize event закрывает stream,
без silent drop/truncate. Медленный stream не блокирует Core и другого consumer.

## SSE и идентичность

Сначала GET/events и `event: ready` с `data: {}`, затем create/start: startup question
может прийти до HTTP start ACK. Подписка установлена до ready; дальше `event: core`,
`data: <CoreEvent>` и пустая строка. Пять типов: session/text/tool/question/notification.
Порядок FIFO и source/generation gating сохраняются по Core. Session IDs передаются точно; text/tool/question/notification session-scoped, без
выдуманной input correlation. Tool start: toolCallId/toolName/args; update: те же IDs,
args/partialResult; end: IDs, result/isError/optional durationMs. Публичные JSON snapshots не дают mutable доступа к Core records.
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
Незавершённые RPC без полученного response при stop/shutdown дают harness-unknown;
уже полученный Native response сохраняется. Late callbacks не оживляют соединение.
После reconnect доступны только current get/list и явные действия, не event replay.

## Privacy, права и ограничения

Token не логируется/не публикуется/не наследуется Native Pi через startup config.
Private exceptions/config/stderr не идут в API; полный Native response — согласованный
product output, не разрешение публиковать orchestration diagnostics. Явный display text может
содержать чувствительные данные: secret filtering не обещан. Native tools сохраняют
права child. Нет sandbox, descendant/remote cleanup guarantees, deployment/service
installation, SDK, permissions engine, UI/harnessd/Telegram/ClaudeCode или generic
executable gateway. Native history принадлежит Pi; собственного registry/locks нет.
Нет hostile same-user filesystem защиты, PID adoption, secure erase или rollback tool effects.

## Проверенная platform boundary

Текущий локальный кандидат проверяется Linux fake-child/port/wire/API/SSE tests,
без настоящего Pi/provider. Оба внешних smoke пути сохраняют translator assertions:
[HTTP/SSE](../../../test/api-external-smoke.mjs) и
[portable sessions/data](../../../test/translator-session-smoke.mjs).
Windows smoke остаётся required CI gate; здесь Windows и independent review не выполнялись.
Прежние Native evidence не являются post-change validation. Нет universal provider/auth,
all-background, Native Windows или remote cleanup гарантии.
