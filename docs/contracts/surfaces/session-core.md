# Ядро сессий

## Граница и владение

`SessionCore` связывает локальные сессии с переданным `HarnessPort`: lifecycle, доступ,
маршрутизация команд/ответов и session-scoped событий. Выбранный Native CLI владеет
native sessions/history, переходами, persistence, execution queue, моделью, tools,
permissions и настройками. Core не второй harness и не знает backend protocol shape.

Контракт описывает текущую поверхность ядра. Правила изменения контрактов: [метаконтракт](../meta-contract.md).

`new SessionCore(port)` сохраняет single-port путь и вывод типа ответа Pi у typed Pi port.
`new SessionCore(registry)` принимает `HarnessRegistry`; [createHarnessRegistry](../../../src/harness-registry.ts)
разрешает opaque ID через переданную trusted composition карту портов и default ID.
Имена модулей и default не зашиты в Core. Это lookup модулей, не registry native history.
Локальные записи хранятся только в памяти. Native registry, file
allocation/import/delete, locks, header parsing, startup restoration и settings mirrors нет.
Сохранённые native files/metadata/locks не загружаются, не мигрируют и не удаляются.

[Pi adapter](pi-text-harness.md) и [Claude Code adapter](claude-code-harness.md) владеют
своими child/каналами; [локальный daemon](local-daemon-api.md) предоставляет authenticated HTTP/SSE.

## Операции и наблюдаемые результаты

- `create(sessionId, harness?)` создаёт `created`; повторный ID даёт `duplicate-session`.
  Unknown module даёт `harness-rejected` до записи, публикации или backend effect.
  Port закрепляется до публикации и остаётся тем же для start/command/reply/stop/shutdown,
  даже при изменении registry map. Map changes влияют только на будущие create.
  Single-port construction разрешает только create без selector.
- `start(sessionId)` только из `created`: `starting` → `running`/`failed`/`unknown` по
  `confirmed`/`rejected`/`unknown` порта. Два последних исхода сообщаются CoreError.
- Пересечение start/stop не позволяет позднему ACK воскресить stopped/unknown источник.
  Если stop отклонён без прежней неопределённости, результат start может примениться.
- `command(sessionId, NativeCommand)` только в `running` без stop: native объект с `type`
  и параметрами передаётся без semantic validation/defaults. Нейтральный `CommandResult` —
  полный `NativeRecord` без обязательного Pi envelope либо local `{kind:'written'}`.
  Legacy `NativeResponse` описывает Pi, а не общий output constraint. Native ошибки
  остаются product response. Потерянный ожидаемый ответ даёт `harness-unknown`;
  unsupported compact адаптера — `harness-rejected`.
- `get/list` возвращают локальные `SessionView {sessionId,status}`, не историю/run state
  или idle process-liveness. Только явный selector добавляет `harness`, включая explicit default.
- `subscribe` доставляет `session/text/tool/question/notification/native-record`, без replay.
- `reply(sessionId, QuestionReply)` допустим в `starting/running` без stop; результат локальный.
- `stop` возвращает SessionView при подтверждении; `shutdown` — сводку cleanup.

Несколько команд могут ждать одновременно в одной сессии; несколько сессий независимы.
Нет wrapper input/run/settlement coordinator, used IDs, idle admission или своей execution
queue. Busy, queued/handled/started, acceptance/refusal определяет Native CLI. Ожидание и
промежуточные события не завершают RPC/run. Нет wait deadlines, retry/abort/restart по ожиданию.
Команды истории/настроек проходят тем же путём без target-file guards или post-command proofs.

Сигнатуры и типы: [core.ts](../../../src/core.ts), [types.ts](../../../src/types.ts). Управление жизненным циклом: [harness-session.ts](../../../src/harness-session.ts); события и проекции: [events.ts](../../../src/events.ts).

## События и идентичность

Контекст задаёт callback `HarnessPort.start(sessionId, emit)`, не native session-file
identity. События актуального поколения принимаются в `starting/running` без stop.
После stop старый источник игнорируется. Native session transition не меняет identity
локального соединения и не перепривязывает его port к native history.
Text/tool/question/notification/native-record session-scoped; input-корреляция не
придумывается. Семантику native команд определяет выбранный CLI.

`native-record` имеет форму `{type:'native-record',sessionId,record}`. Внешний `sessionId`
задаёт Core, не `record.session_id`. Claude публикует полные result/control_request/
control_cancel_request по [своему контракту](claude-code-harness.md); Pi не становится
raw RPC stream. Новый тип подчиняется тем же source gates, snapshots и порядку доставки.

## Наблюдения и явные ответы

`tool`, `question`, `notification` относятся к сессии, не к input. Они принимаются из актуального источника в `starting` и `running` без запроса остановки, в том числе при запуске и без текущего ввода. Native `toolCallId` и question `requestId` не превращаются в придуманную input-корреляцию. После смены поколения или остановки старый источник не принимается.

`tool` передаёт start/update/end с `toolCallId` и `toolName`; `question` — confirm/select/input; `notification` — setStatus/notify. Это наблюдения native событий, не универсальный статус thinking или process-liveness. Поля display payload и вопроса описаны в [контрактах Pi](pi-text-harness.md),
[Claude Code](claude-code-harness.md) и [types.ts](../../../src/types.ts).

`reply` обращается к optional `HarnessPort.reply`: отсутствие даёт `rejected`, исключение —
`unknown` без private причины. Ошибки admission (`closed/session-not-found/invalid-state`)
отдельны от local write result. Pi adapter проверяет transport shape и маршрут ID/method,
не Native expiry/options/consumption/permissions. Claude не реализует этот optional reply:
полный native permission answer идёт через command, без сужения к Pi question.

`ReplyOutcome`: `written/rejected/unknown`. `written` — local callback + drain, не Native
ACK/receipt/consumption. Штатное отсутствие ACK не потеря RPC response. При stop/смене
поколения поздний reply result даёт unknown. Автоматических ответов/retry/replay нет.

Pi-вопрос зарегистрирован adapter до публикации: subscriber может немедленно вызвать reply. Несколько concurrent request IDs одной сессии не заменяют друг друга. Публичные новые варианты readonly; вложенные display/question payload клонируются и глубоко замораживаются, не предоставляя mutable доступ к request/adapter state.

## Остановка и завершение работы

`HarnessPort.stop` возвращает различимые `confirmed`, `rejected`, `unknown`; исключение преобразуется в `unknown`.

| Исход stop | Наблюдаемое поведение |
| --- | --- |
| `confirmed` | Сессия становится `stopped`; это остановка owned процесса, не model-run completion. |
| `rejected` | `harness-rejected`; без прежней неопределённости снимается stop gate. |
| `unknown` | Сессия становится `unknown`; `harness-unknown`, команды закрыты до explicit cleanup. |

Для `created` stop локальный, без порта; для `stopped` отклоняется. Для `failed/unknown`
explicit cleanup достигает порта: неудачный start мог оставить owned child. Пока stop
выполняется, concurrent cleanup даёт unknown без повторного port.stop.

После завершившейся неопределённой попытки новый явный `stop` или последующий первый `shutdown` достигает harness. Исход новой попытки отражается честно; её `rejected` не отменяет предыдущую неопределённость и запрет команд. Автоматических retry, replay и fallback нет.

`shutdown()` сразу закрывает create/start/command/reply/stop/get/list/subscribe (`closed`).
Уже начатые операции могут завершиться; полученный native response сохраняется, а потеря
ожидаемого ответа не подменяется выдуманным response. Cleanup обходит локальные записи,
пропуская только `stopped`; чужие PID не усыновляются и не останавливаются.

Сводка содержит `stoppedSessionIds` только для подтверждённых в этом обходе остановок, `uncertainSessionIds` для неопределённых и `failedSessionIds` для отклонённых. Она не является историей и не гарантирует завершения модели или всех конкурентных операций.

Повторный shutdown возвращает тот же сохранённый Promise и результат, не запускает новый обход. После closed нельзя вызвать новый публичный stop; неопределённая сводка не обещает повторной очистки через уже закрытое ядро.

## Ошибки, проекции и подписчики

`CoreError.code`: `closed/duplicate-session/session-not-found/invalid-state/harness-rejected/harness-unknown`.
Private причины исключений порта не передаются. Pi `success:false` и Claude native
control error — полные responses, не CoreError и не узкий DTO.

Представления/события не раскрывают внутренние session records/config/stderr. Полные
native command responses и явно публикуемые native records — согласованный product
output, не разрешение логировать их или секреты.
Команды/ответы и display payload клонируются и глубоко замораживаются; изменение list
не меняет карту. Core не логирует prompts. Display payload не фильтруется на секреты.

Каждая публикация `session/text/tool/question/notification/native-record` фиксирует получателей при
publish; каждому доставка не более одного раза. Подписки меняют только последующие
публикации: отписка не отменяет уже зафиксированную доставку.

Вложенные синхронные публикации, в том числе межтиповые и межсессионные, доставляются FIFO в порядке publish после доставки предыдущего события всем его зафиксированным получателям. Очередь относится только к текущей доставке, не предоставляет историю или replay.

Синхронное исключение подписчика и отклонение возвращённого им Promise изолируются: они не прерывают ядро и остальных подписчиков. Доставка не ожидает асинхронного завершения слушателей. Это не sandbox и не защита от callback, который не возвращается или бесконечно порождает новые события.

## Ограничения и нецели

Нет SDK, private extension bridge, history/replay engine, permissions engine, summarizer,
model/run status engine, sandbox, secure erase, rollback tool effects или descendant/remote
cleanup guarantees. Core не подтверждает Native persistence/consumption/settlement.
Локальный stop не равен abort RPC. Нейтральные types/core/events/harness-session и
harness-registry не вводят универсального контроллера для будущих сценариев.

## Проверка изменений

Подготовка окружения и минимальный проверенный сценарий: [README](../../../README.md).

`npm run typecheck`, `npm test` и `npm run test:api-smoke` используют FakePort/Node fake
child без Native CLI/моделей. [core-modules.test.ts](../../../test/core-modules.test.ts)
проверяет third opaque module, pinned binding, legacy projections, full native records,
concurrency и cleanup; [core-port-types.ts](../../../test/core-port-types.ts) — Pi type inference.
Сохраняются проверки lifecycle races, source gates, immutable snapshots, FIFO/recipient
isolation, tool/question payloads и no-ACK replies. [API test](../../../test/native-api.test.ts)
проверяет portable соединения, forwarding history-команд и нетронутые старые данные,
не Native recall. Старые history/run/settings-proof responsibilities не возвращаются.
Полный fake suite и typecheck проверены на Linux; четыре внешних Node fake smoke —
на Linux и в Windows CI. Обязательный smoke gate и gitleaks прошли в CI.
Это не реальная Native CLI/provider/auth/model/context интеграция и не full-suite
Windows или Native Windows certification.
