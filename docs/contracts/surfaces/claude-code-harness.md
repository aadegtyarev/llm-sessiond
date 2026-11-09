# Claude Code harness

## Граница и владение

`createClaudeHarness(ClaudeLaunch)` из [claude-harness.ts](../../../src/claude-harness.ts)
реализует нейтральный `HarnessPort` для Native Claude Code stream-json subprocess.
[Core](session-core.md) владеет локальным lifecycle/routing, adapter — своим child,
JSONL каналом, корреляцией control replies и display observations.
Native CLI владеет agent/model/tool loop, permissions, history/persistence, очередью,
настройками и ресурсами. Это не SDK или второй run controller.

## Запуск и readiness

[Composition root](../../../src/daemon-harnesses.ts) регистрирует `claude-code` рядом с
`pi`; default остаётся Pi. Регистрация, create, listener и list не запускают child.
Только start запускает независимый процесс и его native startup/hook effects.
`ClaudeLaunch`: trusted executable (default `claude`), prefixArgs, cwd,
`stopDeadlineMs` (default 5000, finite >0). Claude получает только собственный config
entry либо свои defaults, не Pi prefixArgs/cwd или legacy launch.

[claude-process.ts](../../../src/claude-process.ts) добавляет транспортные flags:
`-p --input-format stream-json --output-format stream-json --verbose --include-partial-messages --permission-prompts host`.
`host` задаёт маршрут permission prompts, не permission-mode. `shell:false`, stdin —
JSON data. Adapter не принуждает model, system prompt, tools, sandbox, history flags,
`--bare`, `--safe-mode`, no-persistence или skip-permissions policy.

Reader и exit/loss observers устанавливаются до первого write. Readiness требует
коррелированный native success для
`{type:'control_request',request_id,request:{subtype:'initialize',hooks:null}}`.
Это не get_state, spawn/таймер или model warmup. Native initialize error даёт rejected,
loss — unknown; неудачный start сохраняет owned child для explicit cleanup.
`hooks:null` в initialize не обещает отсутствия вызовов native startup hooks.

## Команды и результаты

Общий `/command` принимает native JSON object с непустым `type`. Adapter не создаёт
универсальный model API и не валидирует всю native domain schema.
[claude-wire.ts](../../../src/claude-wire.ts) различает два исхода:

| Ввод | Результат |
| --- | --- |
| `control_request` с `request.subtype:string` | Полный native `control_response`, по nested `response.request_id` |
| `user`, явный `control_response`, прочие one-way records | Только `{kind:'written'}` после local callback + drain |
| flat Pi `compact`, включая API/CLI shortcut | `harness-rejected`, без native write |

Caller `request_id:string` сохраняется; при отсутствии генерируется UUID.
Duplicate **in-flight** ID отклоняется до write; после ответа ID можно использовать снова.
Subtypes control request не ограничены wrapper allowlist. Ответы могут приходить
не по порядку. Возвращается весь record с `response.subtype:'success'|'error'`, native
response/error, metadata, usage и неизвестными optional полями. Native error остаётся
HTTP200/CLI exit0; Pi `id/command/success` не добавляются.

`written` не native ACK, acceptance, receipt или turn completion. Нет user→result FIFO
resolver: несколько user writes могут завершаться без ожидания result. Относительный
порядок result и written не гарантируется. Native result
приходит асинхронным событием и завершает native turn, не все background tasks.
Pending control не блокирует interrupt или explicit permission answer. Нет обычного
command deadline, retry/reset/abort по ожиданию, settings mirror, readbacks, summary
или собственной execution queue.

Пример native user body для уже running Claude сессии (форма проверена по source,
не результат реального запуска; native CLI определяет смысл native session fields):

```json
{"type":"user","message":{"role":"user","content":"Привет"},"session_id":"","parent_tool_use_id":null}
```

## События и явные permission answers

[claude-events.ts](../../../src/claude-events.ts) передаёт полные `result`,
`control_request`, `control_cancel_request` как
`{type:'native-record',sessionId,record}` внутри существующего SSE `core` frame.
`record` сохраняет native fields: is_error/errors/usage/metadata, complex input,
permission suggestions и tool IDs. Внешний `sessionId` — локальный маршрут Core;
`record.session_id` его не заменяет. Это не unrestricted raw-all-native stream:
control responses возвращаются вызывающему command, private system/stderr не публикуются.
Pi не начинает публиковать raw RPC. Source/generation gates, immutable snapshots,
FIFO и subscriber isolation сохраняются по контракту Core; replay нет.

Display text берётся только из stream `text_delta`; final assistant text не дублируется.
Thinking/signature/system/stderr не являются display output. Tool start/update используют
native tool_use IDs и input; partial input JSON собирается отдельно по native parent
stream и block index. Tool end возникает только по `tool_result` с известным tool ID,
не по block/message stop или turn result. Выдуманных input IDs/run status нет.

Permission request передаётся целиком. Оператор отправляет native `control_response`
через существующий `/command` или CLI command, сохраняя request_id. Например, только
после явного решения отказать, native body имеет форму:

```json
{"type":"control_response","response":{"subtype":"success","request_id":"REQUEST_ID_FROM_RECORD","response":{"behavior":"deny","message":"Явный отказ оператора"}}}
```

Это пример формы, не автоматическая policy и не проверенный native запуск.
Сложные permissions не сужаются до boolean. Pi-style `/reply` не заменяет native
ответ: у Claude optional port.reply отсутствует и результат — rejected. Core command
доступен только в running: startup permission/UI parity не обещается. Нет autoanswer,
SDK hooks controller, renderer или hidden approve/deny/bypass.

## Потеря канала и cleanup

JSONL reader непрерывный, UTF8 fatal/streaming, LF/CRLF; write учитывает callback и drain.
Полный валидный prefix сохраняется при поздней corruption, включая ответ/event перед
битым UTF8 в том же chunk. Первый malformed JSON/schema/UTF8 record закрывает канал;
последующие records не доставляются. EOF, включая pending JSON/UTF8 suffix, — loss,
не proof остановки. Неполученный pending response становится unknown. Уже полученный
correlated response сохраняется даже при loss до callback/drain; native отказ не
подменяется transport error. Нет invented response из-за штатного отсутствия ACK.

Stop закрывает wire/stdin и посылает SIGTERM только owned child. Confirmed требует
наблюдённый own exit/close либо сохранённый факт выхода. Kill return, EOF и timeout
не proof; unknown сохраняет cleanup responsibility для новой явной попытки по Core.
Idle exit не обновляет автоматически Core.get status; command обнаруживает потерю,
а explicit stop использует retained exit fact. Нет adoption чужих PID и гарантии
завершения descendants, remote или всех background tasks. Shutdown не равен all-cleaned.

## Privacy, ограничения и проверка

Config/token/private exceptions/stderr не публикуются. Полные native responses/records
и display payload — явный product output: они могут содержать чувствительные данные
и не secret-filtered. Права native tools — права child, не sandbox. Full payload
подчиняется API body/SSE limits; oversize/overflow закрывает stream без truncate,
не даёт обещания unbounded/lossless delivery.

Native compatibility target — Claude Code **2.1.311**. Metadata/help,
[официальный headless](https://code.claude.com/docs/en/headless),
[CLI reference](https://code.claude.com/docs/en/cli-reference) и официальные reference-only
wire sources [query.py](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/main/src/claude_agent_sdk/_internal/query.py),
[subprocess_cli.py](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/main/src/claude_agent_sdk/_internal/transport/subprocess_cli.py),
[types.py](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/main/src/claude_agent_sdk/types.py)
использованы для исследования протокола, не как доказательство реальной interoperation.
SDK не устанавливается, его controllers/settings/auth/history code не переносится.

[Wire tests](../../../test/claude-wire.test.ts), [events tests](../../../test/claude-events.test.ts)
и [harness tests](../../../test/claude-harness.test.ts) проверяют fake framing/backpressure,
correlation, prefix-before-loss, permissions, display и owned cleanup.
[External mixed smoke](../../../test/module-external-smoke.mjs) проверяет настоящий
CLI → daemon → Node-only Pi/Claude fakes. Полный fake suite/typecheck проверены на Linux;
все четыре external Node fake smoke прошли на Linux и в Windows CI. Независимый source
review пройден. Это не Native CLI/provider/auth/model/context или Native Windows
проверка и не full-suite Windows certification. Universal recall/persistence/tools/
background гарантии не заявляются. Codex, dynamic plugin loading, SDK framework,
собственный permissions/history/settings/run engine и service rollout не входят в поверхность.

[Daemon API](local-daemon-api.md) задаёт auth/transport limits;
[руководство](../../local-daemon-api.md) — порядок действий оператора;
[CLI](api-cli-client.md) — HTTP/SSE клиент, не process launcher.
