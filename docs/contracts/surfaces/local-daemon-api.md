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
`{token,port?,launch?,stateDir?,nativeSessionDir?}`. Token — 32–256 characters `A-Z a-z 0-9 _ -`, не argv/env/URL.
На каждом API запросе, включая SSE, обязателен `Authorization: Bearer <token>`;
loopback не заменяет auth. Config хранится приватно, на Windows с ограниченным ACL.
Port — integer 0–65535, default3000; 0 выбирает свободный. Launch — trusted operator
config: executable/prefixArgs/cwd/commandDeadlineMs/stopDeadlineMs по контракту Pi.
HTTP не принимает executable/config/raw RPC; права Native Pi не ограничены sandbox.
`stateDir` и `nativeSessionDir` — optional пара непустых trusted operator paths.
Без пары действует in-memory режим с `--no-session`. С парой Core хранит metadata
в stateDir, а Pi — стандартные native files непосредственно в nativeSessionDir.
New session cwd — launch.cwd либо cwd daemon; import использует cwd native header.
Registry/binding paths и private launch config не входят в HTTP DTO.
CLI stdout JSON `listening.host/port` подтверждает bind, SSE `ready` — только подписку.
Readiness Native Pi проверяется коррелированным get_state harness при start, не spawn/таймером.

Canonical roots эксклюзивно заняты Core locks. Второй compliant daemon с любым общим
root отказывает до командных эффектов. Startup acquire/load/bind/address failure
откатывает свои ресурсы через Core cleanup и закрывает listener; uncertain cleanup
не освобождает ownership как будто child остановлен. Clean shutdown освобождает свои
locks. Crash leftovers не удаляются автоматически: safe operator recovery требует
независимого доказательства отсутствия старого writer/child. Детали durability и
ограничения filesystem trust — в [контракте Core](session-core.md).

## HTTP/JSON

POST требует JSON object и `Content-Type: application/json` (optional charset=utf-8);
GET без body. Query/fragment/percent-encoded paths и Origin отклоняются.
Успех — HTTP200 с результатом без envelope. Все POST body обязательны, включая `{}`.

| Метод и путь | Body → result |
| --- | --- |
| POST `/sessions` | `{sessionId}` → SessionView; native-режим резервирует NEW empty file |
| GET `/sessions` | → SessionView[] |
| GET `/sessions/:sessionId` | → SessionView |
| GET `/native-sessions` | → `[{nativeId}]` trusted catalogue; только native-режим |
| POST `/sessions/:sessionId/register` | `{nativeId}` → created SessionView; без запуска, только native-режим |
| POST `/sessions/:sessionId/start` | `{}` → SessionView; created или native explicit reopen stopped |
| POST `/sessions/:sessionId/send` | `{inputId,text}` → InputView |
| POST `/sessions/:sessionId/cancel` | `{inputId}` → InputView целевого ввода |
| POST `/sessions/:sessionId/reply` | QuestionReply → `{kind: written/rejected/unknown}` |
| POST `/sessions/:sessionId/stop` | `{}` → SessionView; история сохраняется |
| POST `/sessions/:sessionId/delete` | `{}` → `{deleted:true}`; native stopped без незавершённых операций |
| POST `/shutdown` | `{}` → `{stoppedSessionIds,uncertainSessionIds,failedSessionIds}` |
| GET `/events` | SSE ready/core frames |

Session/input IDs: 1–128 ASCII `A-Z a-z 0-9 . _ -`. Только для sessionId исключены
ровно `.`/`..` (URL dot-segments); другие dot-containing IDs и dot input IDs допустимы.
Case-sensitive `Foo`/`foo`, `.leading`, `CON` и ID длины128 сохраняют свои semantics;
private metadata basenames кодируются в lowercase base32 с безопасным prefix, не raw ID.
[DTO](../../../src/types.ts): SessionView содержит sessionId/status/input либо null;
InputView — inputId/status. Reply: opaque непустой requestId, method confirm/select/input,
confirmed:boolean для confirm, value:string для select/input либо cancelled:true вместо
ответа; extra fields отклоняются. Отдельного length cap requestId нет; body limit действует.
Cancel принимает только указанный допустимый input ID и строгий body без дополнительных полей; auth проверяется до операции. `cancelled` — статус существующего события `input`, не новый тип SSE. HTTP200 с `unknown` не подтверждает отмену; ошибки admission или отказ harness возвращают HTTP409. Пока control отмены не завершён, новый send блокирован; подтверждённый `cancelled` позволяет продолжить тот же разговор. `cancelled` в QuestionReply отменяет ответ на вопрос, а не input.
HTTP ACK не settlement: pending/unknown блокируют следующий send. Reply written — только
local write, не native receipt/consumption; replies не создают input и не завершают его.

Catalogue содержит только однозначные native UUID валидных canonical regular `.jsonl`
непосредственно trusted root. Нет произвольных HTTP paths, recursive/global Pi search
или выбора symlink/hardlink/неоднозначного UUID. Register проверяет единственного
логического владельца binding. New allocation nonce не является native UUID: header
пишет Pi при первой инициализации, binding/readiness подтверждаются до start success.

Подтверждённый clean stop/shutdown сохраняет native историю и clean metadata snapshot. Новый daemon
восстанавливает registry/current outcome и used IDs без запуска модели; start явно
открывает тот же file/UUID с контекстом, не повторяя messages. Dirty restore — unknown
без ownership прежнего child; stop/shutdown не подменяют его остановку ответом нового port.
Clean stopped с прежним unknown input может reopen и принять новый ID, не меняя старый исход.

Delete требует durable intent и проверки точного registered file/identity, затем удаления
file и metadata. Partial failure остаётся ошибкой; явный matching retry может завершить
ранее записанный intent. Missing/corrupt/replaced либо attempted-empty история не
сбрасывается в новый разговор. Startup ничего не удаляет; unrelated files/tool effects
сохраняются. Журналирования каждого live terminal/SSE event, crash-consistent outcomes
и автоматического repair/replay/retry нет.

## Ошибки и конечные пределы

JSON ошибки: `{"error":{"code":"…"}}`. HTTP401 auth; 400 transport/json/schema;
413 body-too-large; 415 content-type; 404 route; 405 method; 503 closed/stream-limit;
500 internal без private exception. CoreError даёт409 и безопасный code: closed,
duplicate-session/session-not-found/invalid-state/input-in-flight/duplicate-input/
harness-rejected/harness-unknown/storage-failed/native-invalid/native-owned. HTTP200 с unknown не подтверждает успешный исход.
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
Clean-stop success требует сохранённого snapshot. Если metadata write не удалась после
observed owned exit, явный cleanup при восстановлении записи может использовать cached
stop proof без нового port.stop. Reopen/delete остаются fenced через stop checkpoint,
публикации и результат. Registry recovery не является SSE replay: после reconnect нужны
current get/list и явные действия клиента.

## Privacy, права и ограничения

Token не логируется/не публикуется/не наследуется Native Pi через startup config.
Private exceptions/config/raw RPC/stderr не идут в API. Явный display text может
содержать чувствительные данные: secret filtering не обещан. Native tools сохраняют
права child. Нет sandbox, descendant/remote cleanup guarantees, deployment/service
installation, SDK, permissions engine, API model/effort/reload/manual compaction,
UI/harnessd/Telegram/ClaudeCode или generic executable gateway. Native history принадлежит
Pi, registry не зеркалирует prompts/events. Locks координируют только compliant daemons;
нет защиты от стороннего Pi/hostile same-user filesystem mutation, PID adoption/lease
engine, secure erase всех следов или rollback remote/tool effects.

## Проверенная platform boundary

Оба внешних HTTP/SSE fake-native smoke проверены на Linux и actual Windows CI:
observations/replies/cancellation/продолжение и persistent registry/restart/exact recall/
register/delete, включая portable ID semantics. Full suite/typecheck проверены на Linux.
Bounded real Native Pi Linux проверка подтвердила clean daemon restart, exact file/UUID
reopen, completed context recall без marker replay, stop/delete/unrelated preservation
и observed owned child exits. Это не Native Pi Windows/full-suite Windows certification,
универсальная provider/auth, native timeout, all-background или remote cleanup гарантия.
