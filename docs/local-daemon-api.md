# Локальный HTTP/SSE API из checkout

Рабочая инструкция для реализации; итоговая приёмка фичи ещё не заявлена.
Daemon слушает только `127.0.0.1`. Запуск — `node src/daemon-cli.ts` (Node 24).
На stdin передаётся один JSON документ до EOF, не более 65536 bytes:
`{"token":"<32–256 base64url characters>","port":3000,"launch":{}}`.
`port:0` выбирает свободный порт; stdout сообщает JSON `listening.host/port`, не token.
Не передавайте token через argv/URL/env: stdin не наследуется Native Pi.
Храните config с ограниченными правами; Windows требует соответствующего ACL.
Launch — доверенная операторская конфигурация, не HTTP-параметры и не sandbox:
`executable`, `prefixArgs` (string array), `cwd`, положительные конечные
`commandDeadlineMs`/`stopDeadlineMs`. Отсутствующие поля сохраняют defaults Pi.

## Запросы

Каждый запрос, включая SSE, требует `Authorization: Bearer <token>`.
Нет auth-free health endpoint, CORS, browser UI, query parameters или token в URL.
POST требует `Content-Type: application/json` (optional `charset=utf-8`).
GET не принимает body. Все POST body ниже обязательны, в том числе `{}`.

| Метод и путь | Body → JSON result |
| --- | --- |
| POST `/sessions` | `{sessionId}` → SessionView |
| GET `/sessions` | → SessionView[] |
| GET `/sessions/:sessionId` | → SessionView |
| POST `/sessions/:sessionId/start` | `{}` → SessionView |
| POST `/sessions/:sessionId/send` | `{inputId,text}` → InputView |
| POST `/sessions/:sessionId/reply` | QuestionReply → `{kind: written/rejected/unknown}` |
| POST `/sessions/:sessionId/stop` | `{}` → SessionView |
| POST `/shutdown` | `{}` → `{stoppedSessionIds,uncertainSessionIds,failedSessionIds}` |
| GET `/events` | SSE: `event: ready`/`data: {}`, затем `event: core`/`data: <CoreEvent>` |

Успешные операции дают HTTP 200. Session/input IDs: 1–128 ASCII characters
`A-Z a-z 0-9 . _ -`. Публичные DTO и шесть CoreEvent типов определены в
[src/types.ts](../src/types.ts). Reply имеет `requestId` (1–1024 characters),
`method: confirm/select/input` и соответственно `confirmed:boolean`/`value:string`,
либо `cancelled:true` вместо ответа. Extra fields отклоняются.

Сначала подключите SSE и дождитесь **ready**, затем create/start: startup questions
могут прийти до HTTP start ACK. `session`/`input` сохраняют свои projections;
`text`/`tool`/`question`/`notification` session-scoped, native IDs не превращаются
в input correlation. HTTP ACK не settlement; reply written — только local write,
не native consumption. Явный display text может содержать чувствительные данные,
он не secret-filtered. Token/private config/raw RPC/stderr в API не публикуются.

## Ошибки, пределы и потеря связи

Ошибки JSON имеют вид `{"error":{"code":"..."}}`: 401 auth; 400 transport/json/schema;
413 body-too-large; 415 content-type; 404 route; 405 method; 503 closed/stream-limit.
CoreError возвращает HTTP 409 и исходный безопасный code; неожиданный сбой —
500 internal без private exception. Transport/parser может закрыть неполный канал
или вернуть bare HTTP 400/408; HTTP-ошибка не является доказательством settlement.

Request body ≤65536 bytes, HTTP headers ≤8192 bytes; request timeout 15 s,
headers timeout 10 s. Одновременно не более 32 SSE streams. Каждый stream имеет
очередь не более 256 ожидающих frames и byte budget 1048576, включая Node writable
buffer и следующий frame. Oversize event или overflow **закрывает stream**,
без drop/truncate. Медленный stream не блокирует Core или другого consumer.

Нет истории, SSE IDs, replay или resume. После разрыва полнота наблюдения потеряна;
автоматическое reconnect/retry не восстанавливает её и не должно повторять commands.
Get/list возвращают только текущее состояние; explicit stop доступен до shutdown.
Разрыв клиента не отменяет команду и не доказывает остановку сессии.
Shutdown сразу прекращает admission, использует Core cleanup, возвращает честную
сводку и закрывает streams/listener. Unknown не all-cleaned: owned process может
остаться жив, выход daemon process в этом случае не гарантируется. SIGINT/SIGTERM
используют тот же cleanup. Нет обещания cleanup descendants/remote resources.

## Проверки

`npm run test:api-smoke` запускает независимый JS HTTP/SSE client, checkout CLI и
fake Native RPC child с disk/consumed-tuple/owned-exit evidence. Этот же сценарий
запускается на Linux и Windows CI; full suite остаётся Linux. Это не real Pi,
provider/auth или full Native Pi Windows certification. Реальная генерация требует
отдельного разрешения; текущий approved feature задаёт bounded Linux consent.
Границы Core/Pi: [SessionCore](contracts/surfaces/session-core.md),
[Pi adapter](contracts/surfaces/pi-text-harness.md).
