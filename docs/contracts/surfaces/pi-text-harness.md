# Pi text harness

## Граница и владение

`createPiHarness(PiLaunch)` из [pi-harness.ts](../../../src/pi-harness.ts) реализует
`HarnessPort` для штатного Native Pi 1.5 subprocess RPC.
Потребитель — [SessionCore](session-core.md), который владеет lifecycle/admission
и optional durable registry. Adapter не становится вторым владельцем registry.
Adapter владеет процессом и wire/run state: один owned child на логическую сессию.
Pi владеет agent/model/tool loop, tools, skills, MCP, extensions и templates.
Это доверительная граница штатного RPC и native resources, не защита от
произвольной враждебной extension или поддельного протокола.

## Запуск и ввод

`PiLaunch` задаёт trusted executable (default `pi`), prefixArgs, cwd и deadlines:
commandDeadlineMs (default 10000), stopDeadlineMs (default 5000); оба конечные >0.
Без native binding аргументы — `--mode rpc --no-session`, без initial prompt/resume.
При trusted binding от Core используется только точный `--mode rpc --session <absolute file>`;
нет picker/resume, ID/prefix/global поиска или неявного fork. Cwd берётся из binding.
Adapter намеренно не отключает native tools/resources; trusted launch config
контролирует оператор. `shell:false`; текст передаётся только как JSON data.
Child env — копия parent env без `PI_PACKAGE_DIR`; parent/global env не меняется.
Start подтверждается коррелированным успешным `get_state` с проверкой state,
не spawn/задержкой; недоказанная readiness даёт unknown и сохраняет child для cleanup.
При native binding readiness дополнительно требует совпадения correlated state
`sessionId`/`sessionFile` с actual header UUID и exact canonical path; проверяются
cwd и file identity. Core сохраняет подтверждённый binding до running success.
Unique command ID и запись input существуют до write. JSONL использует LF,
optional terminal CR, streaming UTF8, непрерывное чтение и stdin backpressure.

## Native история и повторное открытие

Pi сам пишет стандартные header/history/context. Core до первого launch сохраняет
intent и эксклюзивно выделяет zero-byte file mode0600 (`wx`). Имя allocation — nonce,
не native UUID. Native startup tools/resources могут иметь эффекты до первого prompt,
поэтому fencing начинается перед launch, а не только перед отправкой текста.

Empty initialization допустима только для NEW reservation, ещё не проходившей launch
attempt. Durable start intent снимает eligibility до запуска. Attempted/unknown empty
history не инициализируется повторно после stop; никогда не запускавшаяся пустая запись
остаётся startable. Existing missing/empty/corrupt/replaced history не заменяется новым
разговором. Безопасность allocation/import/reopen/delete и root ownership определяет
[контракт Core](session-core.md).

Файлы — canonical regular, без symlink/hardlink selection и неоднозначного binding.
Header versions1/2/3 поддерживаются; только отсутствие version означает legacy v1.
Проверяются обязательные известные context payloads, native Tool/ToolReference формы
и compaction retention: legacy index не указывает вперёд; modern target — self retain-none
либо ancestor текущей ветки. Unknown extension entries/roles и opaque metadata не
превращаются в универсальную schema/replay модель daemon.

Stop сохраняет native history. Explicit Core reopen stopped запускает новый owned child
на том же точном файле/UUID; прошлый child адаптера должен иметь observed exit.
История не replay-ится вручную и не копируется в registry. Отдельного delete_session RPC
нет: после доказанного stop точный file и metadata удаляет Core.

## Output, ownership и terminal

Текст — только assistant `text_delta`, session-scoped, не привязан к input.
Thinking, stderr, raw RPC/errors/private config и повторный message_end text
не публикуются. Tool/question/notification публикуются только в нормализованной
форме для отображения, не как исходный RPC record. Assistant/tool/question и другой
явный display text не очищается от возможного чувствительного содержания.
Собственный ACK(id,started) и причинный следующий `agent_start` связывают run
с точным inputId; ACK не terminal. Поздние replies/continuations A не меняют B.
`agent_end`, промежуточные error и native retry/recovery не завершают input.
Кандидат terminal — `agent_settled` с финальным assistant message своего run.
Обязательная Native форма assistant проверяется до использования stopReason
([pi-assistant.ts](../../../src/pi-assistant.ts)); optional metadata остаётся opaque.
Поздний malformed assistant сбрасывает прежнее evidence. Определённые обычные исходы без доказанной отмены:

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

## Отмена активного ввода

Для точно зарезервированного owned input с подтверждённым started и его `agent_start` adapter отправляет штатный RPC abort. Отдельное доказательство `input-cancelled` требует совпадающий успешный и завершившийся ответ abort после native waitForIdle, собственный wire `agent_settled.aborted=true` и отсутствие конфликтующего run или ранее принятого естественного terminal. Один ACK, сигнал или extension file не доказывают settlement. DTO и stopReason assistant не являются ни доказательством, ни veto этой независимой control-цепочки; обязательная DTO-проверка обычных completed/failed исходов остаётся без изменений.

Неподтверждённая отмена, потеря канала или deadline дают unknown и требуют explicit stop; автоматических retry, replay, restart и hard-stop нет. После доказанной отмены продолжение использует ту же сессию и owned Pi PID с контекстом ранее завершённых сообщений. Выполненные эффекты tools не откатываются; остановка descendants, remote jobs или инструментов, игнорирующих abort, не гарантируется.

## Tool, question и notification observations

Наблюдения идут через существующий HarnessPort → Core.subscribe, session-scoped,
без присвоения inputId. Они возможны при starting, без owned input и при running;
после stop gate/потери актуального источника не доставляются. Readonly публичные
payload отделены от private records и глубоко заморожены; FIFO, recipient snapshot
и изоляция подписчиков — по [контракту Core](session-core.md).

Native `tool_execution_start/update/end` нормализуются в `tool` с `phase`:

| Phase | Публичные поля |
| --- | --- |
| start | toolCallId, toolName, args |
| update | toolCallId, toolName, args, partialResult |
| end | toolCallId, toolName, result, isError, optional durationMs |

`toolCallId` связывает native lifecycle, не доказывает владение input. Display
args/results имеют JSON-форму; неизвестные private поля RPC record не передаются.
Malformed обязательные поля не публикуются как валидные observations.

Native `extension_ui_request` поддерживает три публичных question метода.
Общие поля: `requestId` из native id, `method`, `title`, optional `timeout` в ms.
Confirm добавляет `message`, select — `options` (строки), input — optional
`placeholder`. Adapter сохраняет вопрос до публикации; немедленный reply из
subscriber и несколько concurrent вопросов одной сессии допустимы.

Fire-and-forget `setStatus` даёт `notification` с method/statusKey и optional
statusText; отсутствие statusText означает очистку. `notify` даёт method/message
и level: только info/warning/error, default info при отсутствии native notifyType.
Это не общий статус thinking/liveness; ответ на notification не отправляется.
Widgets, titles, editor и произвольный renderer/native UI parity не поддерживаются.

## Явные ответы и неопределённость

`Core.reply(sessionId, QuestionReply)` доходит до optional HarnessPort.reply.
`requestId` и `method` должны совпадать с известным вопросом именно этой сессии:

| Метод | Явный ответ |
| --- | --- |
| confirm | confirmed: boolean |
| select | value: string из исходных options |
| input | value: string |
| любой из трёх | cancelled: true вместо confirmed/value |

Неверные ID/method/shape/option и повторная локальная отправка уже использованного
ответа дают rejected без записи. Дублирующий native request ID становится ambiguous,
а не заменяет прежний вопрос. Известный expiry, ambiguous ID или потеря канала
дают unknown; новой записи/replay при этом нет. По optional timeout adapter ведёт
локальный deadline, но момент native expiry раньше наблюдения точно не известен.

Ответ помечается использованным до write, включая concurrent вызовы; неудачная
или неопределённая запись не даёт права автоматического повторения.
`extension_ui_response` не имеет normal command ACK. `written` означает только
успешный локальный stdin callback и снятое backpressure, НЕ receipt/consumption Pi.
Ошибка, потеря канала или write deadline дают unknown. Даже written не доказывает,
что native вопрос ещё не истёк/не был отменён: Pi не публикует универсального
cancellation event. Потребление можно доказать лишь отдельным дальнейшим evidence,
не исходом write. Replies не завершают input, не создают send и не обходят stop.
Скрытых approve/cancel, retry/replay/fallback нет.

Реализация нормализации и ответа: [pi-interaction-events.ts](../../../src/pi-interaction-events.ts),
[pi-questions.ts](../../../src/pi-questions.ts), [pi-wire.ts](../../../src/pi-wire.ts).

## Остановка и ограничения

Stop закрывает stdin и посылает SIGTERM только owned child. Confirmed — только
после наблюдённого exit/close либо сохранённого факта выхода. EOF, kill return,
abort ACK и timeout не доказательства остановки. Unknown сохраняет ownership
для новой явной cleanup; старые события после stop не публикуются.
HarnessPort не имеет отдельного async session-status события: после idle exit
`Core.get` не обещает автоматически актуальный process-liveness; следующий
send получит unknown, explicit stop использует сохранённый факт выхода.
Нет гарантии finished-all-background, cleanup descendants/remote ресурсов,
полной UI/permission parity, произвольного session replacement или sandbox.
Не происходит скрытого approve/cancel. Native tools сохраняют права child.
Нет общей native inference/model/auth end-to-end гарантии или полной native parity.
Автоматические тесты проверяют fake RPC protocol; отдельно разрешённая native
валидация не заменяет это покрытие и не расширяет гарантии адаптера.
Реальная генерация требует отдельного consent. Поддержаны только описанные
observations/replies, не произвольный native parity. Нет собственного UI renderer,
permissions engine, SDK/runtime dependency Pi или отдельного history store адаптера;
стандартная история принадлежит Pi, durable registry — Core. Это не sandbox,
координация стороннего Pi/writer или hostile same-user filesystem защита.

## Проверки

`npm run typecheck` и `npm test`: fake Node RPC child и bounded run/wire tests
проверяют ownership, mandatory DTO/malformed outcomes, output/privacy, retries,
uncertainty, observed-exit cleanup и сохранение launch defaults/resources.
Interaction regressions проверяют immutable shapes, startup/reentrant replies,
три concurrent request ID, validation/expiry/duplicates/channel loss и ответы без ACK.
Bounded real Native Pi проверка на Linux подтвердила completed marker → clean stop/shutdown →
новый daemon без auto-launch → exact file/UUID reopen и recall без повторения marker →
stop/delete с сохранением unrelated file и observed owned child exit/close. External fake
HTTP/SSE smoke, включая persistence/restart/delete и cancellation/replies, проверен на Linux
и actual Windows CI. Full suite/typecheck проверены на Linux, не как full-suite Windows
или Native Pi Windows certification. Это не universal provider/auth, native timeout,
всех background jobs или descendant/remote cleanup гарантия.
Правила lifecycle — [метаконтракт](../meta-contract.md).
