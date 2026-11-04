# Pi text harness

## Граница и владение

`createPiHarness(PiLaunch)` из [pi-harness.ts](../../../src/pi-harness.ts) реализует
существующий `HarnessPort` для штатного Native Pi 1.5 subprocess RPC.
Потребитель — [SessionCore](session-core.md); его гарантии не меняются.
Adapter владеет процессом и wire/run state: один owned child на логическую сессию.
Pi владеет agent/model/tool loop, tools, skills, MCP, extensions и templates.
Это доверительная граница штатного RPC и native resources, не защита от
произвольной враждебной extension или поддельного протокола.

## Запуск и ввод

`PiLaunch` задаёт trusted executable (default `pi`), prefixArgs, cwd и deadlines:
commandDeadlineMs (default 10000), stopDeadlineMs (default 5000); оба конечные >0.
Аргументы по умолчанию — `--mode rpc --no-session`, без initial prompt/resume.
Adapter намеренно не отключает native tools/resources; trusted launch config
контролирует оператор. `shell:false`; текст передаётся только как JSON data.
Child env — копия parent env без `PI_PACKAGE_DIR`; parent/global env не меняется.
Start подтверждается коррелированным успешным `get_state` с проверкой state,
не spawn/задержкой; недоказанная readiness даёт unknown и сохраняет child для cleanup.
Unique command ID и запись input существуют до write. JSONL использует LF,
optional terminal CR, streaming UTF8, непрерывное чтение и stdin backpressure.

## Output, ownership и terminal

Текст — только assistant `text_delta`, session-scoped, не привязан к input.
Thinking/tool/stderr/raw RPC errors/private config и повторный message_end text
не публикуются. Сам assistant text не очищается от возможного чувствительного содержания.
Собственный ACK(id,started) и причинный следующий `agent_start` связывают run
с точным inputId; ACK не terminal. Поздние replies/continuations A не меняют B.
`agent_end`, промежуточные error и native retry/recovery не завершают input.
Кандидат terminal — `agent_settled` с финальным assistant message своего run.
Обязательная Native форма assistant проверяется до использования stopReason
([pi-assistant.ts](../../../src/pi-assistant.ts)); optional metadata остаётся opaque.
Поздний malformed assistant сбрасывает прежнее evidence. Определённые исходы:

| Final stopReason | settled.aborted | Harness terminal |
| --- | --- | --- |
| stop | false | input-completed |
| error | false | input-failed, certainty definitive |
| aborted | true | input-failed, certainty definitive |

Length/toolUse/прочие reason, missing/malformed/conflicting/unproved evidence —
unknown, не completed. Коррелированный prompt success=false до acceptance даёт rejected.
Handled/queued/неизвестная disposition даёт PortOutcome unknown без присвоения
последующего анонимного run этому input. Native команды/background extensions
могут продолжать работу и session text; их completion этому input не обещан.
Core блокирует следующий send при unknown до explicit cleanup, без retry/replay.
Потеря канала/write или ACK deadline даёт unknown; асинхронная потеря активного
подтверждённого run публикует input-failed certainty unknown.

## Остановка и ограничения

Stop закрывает stdin и посылает SIGTERM только owned child. Confirmed — только
после наблюдённого exit/close либо сохранённого факта выхода. EOF, kill return,
abort ACK и timeout не доказательства остановки. Unknown сохраняет ownership
для новой явной cleanup; старые события после stop не публикуются.
HarnessPort не имеет отдельного async session-status события: после idle exit
`Core.get` не обещает автоматически актуальный process-liveness; следующий
send получит unknown, explicit stop использует сохранённый факт выхода.
Нет гарантии finished-all-background, cleanup descendants/remote ресурсов,
UI/permission dialogs, произвольного session replacement или sandbox.
Не происходит скрытого approve/cancel. Native tools сохраняют права child.
Нет общей native inference/model/auth end-to-end гарантии или полной native parity.
Автоматические тесты проверяют fake RPC protocol; отдельно разрешённая native
валидация не заменяет это покрытие и не расширяет гарантии адаптера.
Реальная генерация требует отдельного consent. Публичные tool/question/status
observations и native replies не поддерживаются.

## Проверки

`npm run typecheck` и `npm test`: fake Node RPC child и bounded run/wire tests
проверяют ownership, mandatory DTO/malformed outcomes, output/privacy, retries,
uncertainty, observed-exit cleanup и сохранение launch defaults/resources.
Правила lifecycle — [метаконтракт](../meta-contract.md).
