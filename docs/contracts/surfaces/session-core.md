# Ядро сессий

## Граница и владение

`SessionCore` связывает локальные сессии с переданным `HarnessPort`: lifecycle, доступ,
маршрутизация команд/ответов и session-scoped событий. Pi владеет native sessions/history,
переходами, persistence, execution queue, моделью, tools и настройками. Core не второй harness.

Контракт описывает текущий локальный код; независимая приёмка кандидата ещё требуется. Правила изменения контрактов: [метаконтракт](../meta-contract.md).

`new SessionCore(port)` хранит только локальные записи в памяти. Native registry, file
allocation/import/delete, locks, header parsing, startup restoration и settings mirrors нет.
Сохранённые native files/metadata/locks не загружаются, не мигрируют и не удаляются.

[Native Pi text adapter](pi-text-harness.md) владеет child и native RPC;
[локальный daemon](local-daemon-api.md) предоставляет authenticated HTTP/SSE.

## Операции и наблюдаемые результаты

- `create(sessionId)` создаёт `created`; повторный ID даёт `duplicate-session`.
- `start(sessionId)` только из `created`: `starting` → `running`/`failed`/`unknown` по
  `confirmed`/`rejected`/`unknown` порта. Два последних исхода сообщаются CoreError.
- Пересечение start/stop не позволяет позднему ACK воскресить stopped/unknown источник.
  Если stop отклонён без прежней неопределённости, результат start может примениться.
- `command(sessionId, NativeCommand)` только в `running` без stop: native объект с `type`
  и параметрами передаётся без semantic validation/defaults. Возвращается полный
  `NativeResponse`, включая `id/type/command/success/data` либо `error` и все optional поля.
  Native `success:false` не CoreError. Потерянный ожидаемый ответ даёт `harness-unknown`;
  unsupported compact адаптера — `harness-rejected`.
- `get/list` возвращают локальные `SessionView {sessionId,status}`, не историю/run state.
- `subscribe` доставляет `session/text/tool/question/notification`, без replay.
- `reply(sessionId, QuestionReply)` допустим в `starting/running` без stop; результат локальный.
- `stop` возвращает SessionView при подтверждении; `shutdown` — сводку cleanup.

Несколько команд могут ждать одновременно в одной сессии; несколько сессий независимы.
Нет wrapper input/run/settlement coordinator, used IDs, idle admission или своей execution
queue. Busy, queued/handled/started, acceptance/refusal определяет Pi. Ожидание и
промежуточные события не завершают RPC/run. Нет wait deadlines, retry/abort/restart по ожиданию.
Команды истории/настроек проходят тем же путём без target-file guards или post-command proofs.

Сигнатуры и типы: [core.ts](../../../src/core.ts), [types.ts](../../../src/types.ts). Управление жизненным циклом: [harness-session.ts](../../../src/harness-session.ts); события и проекции: [events.ts](../../../src/events.ts).

## События и идентичность

Контекст задаёт callback `HarnessPort.start(sessionId, emit)`, не native session-file
identity. События актуального поколения принимаются в `starting/running` без stop.
После stop старый источник игнорируется. Native session transition не меняет identity
локального соединения. Text/tool/question/notification session-scoped; input-корреляция
не придумывается. Семантику `abort` и иных команд определяет Pi.

## Наблюдения и явные ответы

`tool`, `question`, `notification` относятся к сессии, не к input. Они принимаются из актуального источника в `starting` и `running` без запроса остановки, в том числе при запуске и без текущего ввода. Native `toolCallId` и question `requestId` не превращаются в придуманную input-корреляцию. После смены поколения или остановки старый источник не принимается.

`tool` передаёт start/update/end с `toolCallId` и `toolName`; `question` — confirm/select/input; `notification` — setStatus/notify. Это наблюдения native событий, не универсальный статус thinking или process-liveness. Поля display payload и вопроса описаны в [контракте Pi](pi-text-harness.md) и [types.ts](../../../src/types.ts).

`reply` обращается к optional `HarnessPort.reply`: отсутствие даёт `rejected`, исключение —
`unknown` без private причины. Ошибки admission (`closed/session-not-found/invalid-state`)
отдельны от local write result. Adapter проверяет transport shape и маршрут ID/method,
не Native expiry/options/consumption/permissions.

`ReplyOutcome`: `written/rejected/unknown`. `written` — local callback + drain, не Native
ACK/receipt/consumption. Штатное отсутствие ACK не потеря RPC response. При stop/смене
поколения поздний reply result даёт unknown. Автоматических ответов/retry/replay нет.

Вопрос зарегистрирован adapter до публикации: subscriber может немедленно вызвать reply. Несколько concurrent request IDs одной сессии не заменяют друг друга. Публичные новые варианты readonly; вложенные display/question payload клонируются и глубоко замораживаются, не предоставляя mutable доступ к request/adapter state.

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
Private причины исключений порта не передаются. Native `success:false` — полный response,
не CoreError и не узкий DTO.

Представления/события не раскрывают private records/config/stderr. Полный native command
response — согласованный product output, не разрешение логировать его или секреты.
Команды/ответы и display payload клонируются и глубоко замораживаются; изменение list
не меняет карту. Core не логирует prompts. Display payload не фильтруется на секреты.

Каждая публикация `session/text/tool/question/notification` фиксирует получателей при
publish; каждому доставка не более одного раза. Подписки меняют только последующие
публикации: отписка не отменяет уже зафиксированную доставку.

Вложенные синхронные публикации, в том числе межтиповые и межсессионные, доставляются FIFO в порядке publish после доставки предыдущего события всем его зафиксированным получателям. Очередь относится только к текущей доставке, не предоставляет историю или replay.

Синхронное исключение подписчика и отклонение возвращённого им Promise изолируются: они не прерывают ядро и остальных подписчиков. Доставка не ожидает асинхронного завершения слушателей. Это не sandbox и не защита от callback, который не возвращается или бесконечно порождает новые события.

## Ограничения и нецели

Нет SDK, private extension bridge, history/replay engine, permissions engine, summarizer,
model/run status engine, sandbox, secure erase, rollback tool effects или descendant/remote
cleanup guarantees. Core не подтверждает Native persistence/consumption/settlement.
Локальный stop не равен abort RPC. Реализация остаётся в types/core/events/harness-session,
без универсального контроллера для будущих сценариев.

## Проверка изменений

Подготовка окружения и минимальный проверенный сценарий: [README](../../../README.md).

`npm run typecheck`, `npm test` и `npm run test:api-smoke` используют FakePort/Node fake
child без Pi/моделей. Проверяются whole responses, concurrency/loss, lifecycle races,
source gates, immutable snapshots, FIFO/recipient isolation, tool/question payloads и
no-ACK replies. [External API test](../../../test/native-api.test.ts) проверяет portable
соединения, forwarding history-команд и нетронутые старые данные, не Native recall.
Устаревшие history/run/settings-proof suites удалены вместе с ответственностями.
Текущая локальная валидация — Linux fake tests; Windows и независимый review ожидаются.
Прежние реальные Native результаты не являются валидацией текущего изменения.
