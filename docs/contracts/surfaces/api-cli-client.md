# Командный API CLI клиент

## Граница и владение

[api-cli.ts](../../../src/api-cli.ts) — обычная Node24 командная утилита для shell/external automation и эталонный внешний HTTP/JSON + SSE клиент. Это не интерактивный чат, TUI или SDK. [Внутренний transport](../../../src/api-client.ts) обращается только к `127.0.0.1`; Core, daemon runtime, Native SDK и test client для выполнения не импортируются; переиспользуются только чистые config/schema validators.

Клиент не запускает процессы. Явный start — HTTP start; daemon запускает выбранный
Native CLI. History, модель, tools, permissions, настройки, очередь и acceptance/refusal
принадлежат Native CLI; local lifecycle/routing — daemon. Default остаётся Pi.

## Вызов и вход

```text
node src/api-cli.ts --config FILE [--port PORT] OPERATION [SESSION_ID]
npm run --silent client -- --config FILE [--port PORT] OPERATION [SESSION_ID]
node src/api-cli.ts --config FILE [--port PORT] --harness ID create SESSION_ID
```

`--config` обязателен. Optional `--harness ID` допустим только для create; без него
сохраняется default Pi. ID — непустая opaque строка, известность модуля проверяет сервер,
не клиент. Флаги только перед операцией, в любом порядке, каждый не более одного раза; имя и непустое значение — отдельные argv; значение не начинается с `--` (для такого имени файла используйте путь с `./`). Unknown/duplicate flags, extra/missing arguments и неизвестные операции дают exit2; help/pretty/URL/host/token flags нет. Без `--silent` banner npm не относится к stdout самого CLI. Существующий `npm start` по-прежнему запускает daemon.

Config — приватный JSON `{token,port?,launch?,harnesses?}` по [API](local-daemon-api.md). UTF8 без BOM, ≤65536 bytes; default port3000. `--port` — ASCII цифры без знака/дроби/exponent, integer1–65535 (leading zeros допустимы); override применяется к actual bound port. Config port0 без override — exit2, discovery нет. Launch и harnesses entries валидируются чистой схемой, но не исполняются.
Схема клиента проверяет shape map, а не registry names серверной composition;
unknown module config ID сам по себе не local CLI ошибка. Token не argv/env/URL; файл и каталог должны быть приватными, на Windows нужен соответствующий ACL, не только Unix chmod.

Session ID проходит существующую API lexical validation: ASCII1–128 `A-Z a-z 0-9 . _ -`, кроме ровно `.`/`..`. После операции аргумент трактуется только как SESSION_ID, не как flag: допустимый ID `--port` остаётся ID. Флаги разбираются только в префиксе до операции. ID не превращается в произвольный URL/path.

## Операции

| Операция | SESSION_ID | HTTP / stdin |
| --- | --- | --- |
| create | обязателен | POST `/sessions`, body `{sessionId,harness?}` из prefix flags |
| list | нет | GET `/sessions` |
| get | обязателен | GET `/sessions/:sessionId` |
| start | обязателен | POST `/sessions/:sessionId/start`, `{}` |
| stop | обязателен | POST `/sessions/:sessionId/stop`, `{}` |
| shutdown | нет | POST `/shutdown`, `{}` |
| command | обязателен | POST `/sessions/:sessionId/command`; stdin native JSON object с непустым string type |
| compact | обязателен | POST `/sessions/:sessionId/compact`; optional stdin JSON |
| reply | обязателен | POST `/sessions/:sessionId/reply`; stdin QuestionReply JSON |
| events | нет | GET `/events` |

command/reply/compact читают stdin до EOF, не до первого chunk/строки. UTF8 без BOM, ≤65536 bytes; один JSON object. command/reply требуют payload: пустой stdin — exit2. compact принимает ноль bytes как `{}`; иначе строго `{}` или `{"customInstructions":"..."}`. Whitespace-only, malformed/extra JSON и неверные формы — exit2 до запроса. Проверенный непустой stdin передаётся как исходный JSON HTTP body без повторной сериализации. Синтаксически валидный payload может получить отдельный отказ API или выбранного
Native CLI; domain policy клиент не реализует.

У остальных операций stdin не читается. command параметры, включая optional поля и выбранный клиентом streamingBehavior, не подменяются; defaults/allowlist/автоматических readbacks нет. Reply shape остаётся прежним Pi QuestionReply; written/rejected/unknown — локальные
результаты, не Native ACK. Для Claude permission answer используйте полный native
control_response через command; reply на Claude даёт rejected, compact shortcut —409
harness-rejected. Claude one-way command возвращает только local written, control_request —
полный native control_response, result приходит асинхронным native-record в events.
[Native Claude boundary](claude-code-harness.md); [QuestionReply и transport limits](local-daemon-api.md).

## stdout, stderr и exit codes

Обычный результат — весь полученный API JSON, сериализованный одной записью + LF без CLI envelope; optional поля и Native ошибки сохраняются. `events` — NDJSON `{event,data}`, одна запись + LF на SSE frame. Token/config/private exceptions/body не печатаются в diagnostics. Явный Native payload stdout не secret-filtered: он может содержать чувствительный product text.

| Exit | Значение |
| --- | --- |
| 0 | Получен HTTP200 JSON, включая Pi success:false, Claude native control error/local written, reply unknown/rejected и uncertain shutdown summary |
| 1 | API HTTP failure с полным JSON stdout либо HTTP/network/stream/output transport failure |
| 2 | CLI args/config/JSON/local shape validation failure до HTTP effect |

Exit0 не Native success/run completion/all-cleaned; ACK не completion и reply written не consumption. API HTTP error печатается как полученный JSON. Если валидного API JSON нет (например bare HTTP400, неверный content type/UTF8/JSON), CLI не выдумывает error body. Redirect не выполняется и даёт exit1 без пересылки bearer token. Локальные ошибки: stderr `invalid CLI input`; transport ошибки: stderr `API transport failed`, без private причины. OS interruption не является обычным API результатом.

## SSE, EOF и разрывы

Клиент непрерывно декодирует UTF8, делит только по LF, принимает CRLF, сохраняет JSON escaping и весь data. Ожидаются существующие двухстрочные ready/core frames; первый frame — ready с `{}`, повторный ready или malformed data/frame дают exit1. Нормализованный незавершённый frame ограничен существующим API byte budget1MiB. Output ждёт local callback+drain; чтение приостанавливается при stdout backpressure. Event history не накапливается.

Чистый HTTP EOF после ready на полной границе frame — exit0: это закрытие потока, не proof завершения Native работы. EOF до ready, обрезанный frame/UTF8, socket/stream loss или output error — exit1; уже записанный NDJSON prefix сохраняется. Автоматических reconnect/replay/retry/abort/stop/shutdown/UI answers нет. Завершение/убийство клиента закрывает только его соединение; команда могла уже иметь эффект на сервере.

## Ограничения и проверки

Семантика local lifecycle и Native команд принадлежит [API](local-daemon-api.md),
[Core](session-core.md), [Pi](pi-text-harness.md) и [Claude Code](claude-code-harness.md). Клиент не SDK, permissions/history/queue/settings/run controller, process launcher или model monitor. Недостающие Native RPC операции не эмулируются. Никаких новых API guarantees или Native Windows/provider certification.

`npm run typecheck`, `npm test` и `npm run test:api-smoke` проверяют Node fake fixtures,
не настоящие Native CLI/модели. [CLI smoke](../../../test/api-cli-smoke.mjs) запускает настоящий CLI subprocess → daemon-cli subprocess → Node fake child и проверяет все10 операций, startup question/явный no-ACK reply, full JSON/ошибки/compact/Unicode, NDJSON и cleanup. Transport/input/lifecycle tests проверяют args/config/body errors, disconnect/no-hidden-effects, UTF8/EOF, backpressure и отсутствие replay.

[Mixed module smoke](../../../test/module-external-smoke.mjs) дополнительно проверяет
CLI selector, Pi/Claude isolation, full native records/errors и explicit permissions.
Input tests проверяют исходную JSON строку без numeric expansion при пересериализации,
prefix selector errors и отсутствие HTTP effects при local отказе.
Полный fake suite и typecheck проверены на Linux. Все четыре внешних Node fake smoke
прошли на Linux и в Windows CI; required both-platform guard и gitleaks прошли в CI.
Независимый source review пройден. Это не full-suite Windows certification или real
CLI → Native/provider/auth/model/context проверка; Native Windows не сертифицирован.
