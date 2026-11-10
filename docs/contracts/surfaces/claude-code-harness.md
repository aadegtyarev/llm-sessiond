# Claude Code harness

[createClaudeHarness(ClaudeLaunch)](../../../src/claude-harness.ts) реализует нейтральный `HarnessPort`: свой процесс/JSONL канал на сессию, корреляция control replies и display. [Core](session-core.md) управляет локальным lifecycle, Native — выполнением и данными. Это не SDK или второй run controller.

Полные [config](../../daemon-config.md), [native команды/результаты](../../native-commands.md), [события](../../events.md), [безопасность и проверки](../../safety-and-validation.md) — обязательные части контракта.

## Запуск и readiness

Модуль `claude-code` не default: без selector выбран Pi. Только start запускает child с native startup/hooks. [Launch](../../daemon-config.md#поля) использует собственный config, не Pi cwd/args; executable по умолчанию `claude`, stop deadline — 5000ms, конечный >0.

[Process](../../../src/claude-process.ts) добавляет flags:

```text
-p --input-format stream-json --output-format stream-json --verbose
--include-partial-messages --permission-prompts host
```

`host` маршрутизирует prompts, не задаёт permission-mode. `shell:false`, stdin — JSON. Адаптер не принуждает model, system prompt, tools, sandbox, history flags, bare/safe-mode/no-persistence/skip-permissions policy.

Reader и observers выхода/потери ставятся до первого write. Readiness требует коррелированный success на control_request с `request:{subtype:'initialize',hooks:null}`. Native error даёт rejected, loss — unknown; child остаётся для явной очистки. Spawn, таймер, get_state или прогрев модели не readiness. Hooks:null не обещает отсутствия native startup hooks.

## Команды и результаты

[Wire](../../../src/claude-wire.ts) требует `request.subtype:string` для control_request. Переданный request_id:string сохраняется; при отсутствии генерируется UUID. Повторный in-flight ID отклоняется до write; после ответа ID можно использовать снова. Subtypes не ограничены allowlist; полная native domain schema не проверяется.

Корреляция идёт по nested response.request_id, не FIFO. Полный control_response с success/error, metadata, usage и неизвестными полями возвращается без Pi envelope. Ожидание завершается native ответом, не callback/drain; native error остаётся HTTP200/exit0.

One-way user/explicit control_response/прочие records возвращают local written после callback+drain. [Полная семантика written/result](../../native-commands.md#результаты) обязательна: фиксированного порядка или user-result resolver нет. Pending control не блокирует interrupt/явный answer. Flat Pi compact/shortcut отклоняется до write, без эмуляции. Deadline/retry/reset/abort по ожиданию и собственной очереди нет.

## События и явные permission answers

[События](../../events.md#источники) полностью определяют display/tool mapping и публикацию полных result/control_request/control_cancel_request. Это не raw-all-native. [Маршрут, snapshots, FIFO и source gates](../../events.md#маршрут-и-доставка) обязательны.

[Явный permission answer](../../native-commands.md#явный-ответ-claude) сохраняет request_id и сложный payload, не сужается до boolean. Optional reply отсутствует и даёт rejected. Command допустим только running. Startup UI/permission parity, автоматических/скрытых approve/deny/bypass или SDK hooks controller нет.

## Потеря канала и cleanup

JSONL читается непрерывно: fatal streaming UTF8, LF/CRLF. Первая ошибка JSON/schema/UTF8 закрывает канал; последующие records игнорируются. Валидный prefix сохраняется, даже перед битым UTF8 в том же chunk. EOF с любым suffix — loss, не доказательство выхода. Неполученный response даёт unknown; полученный сохраняется даже до callback/drain. Отсутствие штатного ACK не создаёт response/error.

Stop закрывает wire/stdin и посылает SIGTERM только своему child. [Подтверждение выхода и ответственность при unknown](../../safety-and-validation.md#остановка), [гонки cleanup](session-core.md#остановка-и-завершение-работы) обязательны. Idle exit не обновляет Core.get: command обнаруживает потерю, stop использует сохранённый факт выхода.

## Совместимость и ограничения

Целевая версия — Claude Code **2.1.311**. [Headless](https://code.claude.com/docs/en/headless), [CLI reference](https://code.claude.com/docs/en/cli-reference) и wire references [query.py](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/main/src/claude_agent_sdk/_internal/query.py), [subprocess_cli.py](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/main/src/claude_agent_sdk/_internal/transport/subprocess_cli.py), [types.py](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/main/src/claude_agent_sdk/types.py) не доказывают реальную совместимость. SDK не устанавливается, его controllers/settings/auth/history code не переносится.

Private config/token/исключения/stderr закрыты; product payload **может содержать секреты**. Tools имеют права child, не sandbox. Пределы [body](../../api-reference.md#пределы) и [SSE](../../events.md#пределы) действуют на полный payload; overflow закрывает stream без truncate. [Нецели и границы проверки](../../safety-and-validation.md) обязательны.
