# Командный API CLI клиент

[api-cli.ts](../../../src/api-cli.ts) — Node.js 24 HTTP/SSE клиент для shell и автоматизации, не чат, TUI, SDK или launcher процессов. [Transport](../../../src/api-client.ts) обращается только к `127.0.0.1`. Клиент импортирует чистые validators, не runtime Core/daemon, SDK или test client.

[HTTP](../../api-reference.md), [config](../../daemon-config.md), [native payload/results](../../native-commands.md), [события](../../events.md), [безопасность и проверки](../../safety-and-validation.md) — обязательные части контракта. Start посылает HTTP-запрос; Native запускает daemon.

## Вызов

```text
node src/api-cli.ts --config FILE [--port PORT] [--harness ID] OPERATION [SESSION_ID]
```

`--config` обязателен; `--harness` допустим только для create. Default — Pi; opaque ID модуля проверяет сервер. Флаги идут перед операцией в любом порядке, без повторов. Имя и непустое значение — отдельные argv; значение не начинается с `--`. Для такого имени файла используйте `./`. Неизвестный/повторный флаг, неверные аргументы/операция дают exit2. Флагов help/pretty/URL/host/token нет.

Create, get, start, stop, command, compact, reply требуют SESSION_ID; list, shutdown, events — нет. После операции [допустимый ID](../../api-reference.md#сессии) всегда positional: даже `--port` остаётся ID, не произвольным URL/path.

Альтернатива: `npm run --silent client -- …`; без silent npm banner не относится к stdout CLI. `npm start` запускает daemon.

## Вход

Config и stdin требуют UTF8 без BOM, ≤65536 bytes. Default port — 3000. `--port`: ASCII цифры, целое 1–65535; ведущие нули допустимы, знак/дробь/exponent запрещены. Config port0 требует actual-port override, discovery нет. Launch/map проверяются, не исполняются; неизвестный config module ID не локальная ошибка. Token не argv/env/URL/log; файл/каталог приватны, Windows требует ACL.

Command/reply/compact читают один JSON object до EOF. Command требует непустой string type, reply — QuestionReply; пустой stdin даёт exit2. Compact принимает ноль bytes как `{}`, иначе строго `{}` или `{customInstructions:string}`. Whitespace-only, malformed/extra JSON и неверная форма дают exit2 **до HTTP**. Непустая проверенная строка передаётся исходной, без пересериализации или подмены параметров. Native policy/defaults/allowlist/readbacks нет. Остальные операции stdin не читают; HTTP/body определены в [маршрутах](../../api-reference.md#маршруты).

## Вывод и завершение

Stdout содержит весь API JSON одной записью с LF, без envelope; events — NDJSON `{event,data}` на frame. Optional поля и native ошибки сохраняются, фильтрации секретов нет. Diagnostics не печатают token/config/private exceptions/body.

| Exit | Значение |
| --- | --- |
| 0 | HTTP200, включая native error/written, reply unknown/rejected, uncertain shutdown |
| 1 | API failure с полным JSON либо HTTP/network/stream/output failure |
| 2 | Args/config/JSON/shape error до HTTP |

Exit0 не доказывает успех/завершение Native или all-cleaned; written не consumption. Без валидного content-type/UTF8/JSON error body не выдумывается. Redirect даёт exit1 без пересылки bearer. Stderr: `invalid CLI input` или `API transport failed`, без приватной причины. OS interruption не API-результат.

## Поток и ограничения

Непрерывный UTF8 decoder делит по LF, принимает CRLF, сохраняет escaping/data. Двухстрочные ready/core frames начинаются с ready `{}`. Повторный ready или malformed frame/data дают exit1. Незавершённый нормализованный frame ≤1MiB. Output ждёт callback+drain; stdout backpressure приостанавливает чтение. История не копится.

Чистый EOF после ready на границе frame даёт exit0, не Native completion. EOF до ready, обрезанный frame/UTF8, потеря сокета/потока/output дают exit1; записанный NDJSON prefix сохраняется.

Нет автоматических reconnect/replay/retry/abort/stop/shutdown или ответов UI. Убийство клиента закрывает только соединение; эффект на сервере возможен. Это не controller или model monitor. [Пределы fake/Native/platform проверки](../../safety-and-validation.md#проверки) обязательны.
