# Ядро сессий

## Граница и владение

`SessionCore` связывает логические сессии с одним переданным `HarnessPort` и владеет текущим состоянием сессии и ввода. Потребители поверхности — вызывающий код и адаптер harness. Цикл агента, модель, инструменты, процесс и RPC принадлежат harness.

Это текущий нормативный контракт принятой реализации. Правила изменения контрактов: [метаконтракт](../meta-contract.md).

Без options ядро хранит только состояние в памяти. `new SessionCore(port, nativeOptions)`
включает долговечный registry native-сессий: доверенные `stateDir`, `nativeSessionDir`
и optional `cwd` (по умолчанию cwd процесса). Pi владеет стандартной историей;
registry не копирует prompts, messages или события. Paths и binding не входят в SessionView.

[Native Pi text adapter](pi-text-harness.md) владеет child и native RPC;
[локальный daemon](local-daemon-api.md) предоставляет authenticated HTTP/SSE.

## Операции и наблюдаемые результаты

- `create(sessionId)` создаёт `created` и возвращает `SessionView`; повторный ID отклоняется. В native-режиме intent записывается до эксклюзивной allocation пустого native file; header пишет Pi, не Core.
- `catalogue()` в native-режиме возвращает `readonly {nativeId}[]` из непосредственных `.jsonl` доверенного nativeSessionDir. Невалидные/пустые файлы и неоднозначные UUID не предлагаются; global/recursive Pi search нет.
- `register(sessionId, nativeId)` регистрирует существующую историю из этого catalogue без запуска. Один binding не получает второго логического владельца; raw path не является input операции.
- `start(sessionId)` допустим из `created`, а в native-режиме также для explicit reopen `stopped`. Незавершённые операции, stop и delete intent блокируют reopen. Ядро публикует `starting` и вызывает `HarnessPort.start`; без пересечения с остановкой `confirmed` даёт `running`, `rejected` — `failed`, `unknown` — `unknown`. Два последних исхода сообщаются ошибкой; native binding сохраняется до readiness success.
- При пересечении start и stop поздний ACK запуска не восстанавливает остановленную или неопределённую сессию. Если stop отклонён без прежней неопределённости, результат запуска может быть применён.
- `send(sessionId, inputId, text)` допустим только в `running` без запроса остановки. Возвращает `InputView` именно этого вызова, даже если до его ACK уже завершился ввод и начался следующий.
- `cancel(sessionId, inputId)` запрашивает отмену точно указанного активного ввода и возвращает `InputView` этого ввода, а не следующего.
- `get(sessionId)` и `list()` возвращают текущее состояние, не историю. `SessionView` содержит `sessionId`, `status` и текущий `input` либо `null`; `InputView` содержит `inputId` и `status`.
- `subscribe(listener)` подписывает на `session`, `input`, `text`, `tool`, `question`, `notification` и возвращает функцию отписки. Прошлые события не воспроизводятся.
- `reply(sessionId, QuestionReply)` явно отвечает на native question, не создавая новый input. Допустим в `starting`/`running`, пока остановка не запрошена; возвращает `ReplyOutcome`, а не завершение модели.
- `stop(sessionId)` возвращает представление при подтверждённой остановке; `shutdown()` возвращает сводку остановок.
- `delete(sessionId)` в native-режиме допустим только для `stopped` без незавершённых операций. После durable delete intent удаляются точный зарегистрированный native file и metadata record. Частичная ошибка не объявляется успехом; explicit matching retry может завершить удаление. Startup не удаляет файлы, чужие пути/tool effects не затрагиваются.

Сигнатуры и типы: [core.ts](../../../src/core.ts), [types.ts](../../../src/types.ts). Управление жизненным циклом: [harness-session.ts](../../../src/harness-session.ts); события и проекции: [events.ts](../../../src/events.ts).

## Ввод, события и идентичность

В текущем поколении сессии не более одного незавершённого ввода: `pending` и `unknown`
блокируют следующий send. Уже использованный `inputId` повторно не принимается; в native-режиме
used IDs сохраняются между daemon restart и reopen. Сессии изолированы. После доказанного
stop и native reopen старый unknown outcome остаётся unknown, но не блокирует новый input
нового поколения. Старые callbacks/ACK не изменяют новое поколение.

ACK отправки не означает завершение модели. Пока ввод `pending`, `confirmed` оставляет его ожидающим, `rejected` переводит в `failed`, `unknown` — в `unknown`. Исключение порта трактуется как `unknown`.

Терминальное событие принимается только в `running`, из актуального источника этой сессии и для точного `inputId` текущего `pending`/`unknown` ввода. Контекст сессии задаётся callback, переданным в `HarnessPort.start(sessionId, emit, nativeBinding?)`: событие harness не содержит отдельного `sessionId`. Публичное событие ввода включает `sessionId` и `inputId`.

`input-completed` даёт `completed`; `input-failed` с `definitive` даёт `failed`, с `unknown` — `unknown`. Раннее терминальное событие не отменяется поздним ACK, независимо от его исхода. Неопределённость не является подтверждением завершения.

## Отмена активного ввода

`cancel` допускается только для точного текущего `pending` ввода с подтверждённым приёмом send в работающей сессии; stale ID, дубликаты и конкурентные запросы не переназначаются другому вводу. Ядро синхронно резервирует отмену до вызова optional `HarnessPort.cancel`. Отсутствие поддержки или `rejected` сообщает `harness-rejected` и не доказывает terminal. `unknown` оставляет ввод неопределённым: новый send блокирован до explicit stop. ACK отмены сам по себе не settlement; `input-cancelled` даёт терминальный статус `cancelled`.

Естественный terminal, принятый раньше, сохраняет свой исход. Пока control отмены не завершён, следующий send блокирован даже после естественного terminal. Подтверждённый `cancelled` публикуется после открытия этого admission fence: subscriber может немедленно отправить B, а поздний исход A не изменит B. Возвращаемое представление относится к A даже при reentry.

`text` относится к сессии, а не к отдельному вводу. После подтверждённой или неопределённой остановки события прежнего источника игнорируются; поздние ACK не воскрешают состояние.

## Наблюдения и явные ответы

`tool`, `question`, `notification` относятся к сессии, не к input. Они принимаются из актуального источника в `starting` и `running` без запроса остановки, в том числе при запуске и без текущего ввода. Native `toolCallId` и question `requestId` не превращаются в придуманную input-корреляцию. После смены поколения или остановки старый источник не принимается.

`tool` передаёт start/update/end с `toolCallId` и `toolName`; `question` — confirm/select/input; `notification` — setStatus/notify. Это наблюдения native событий, не универсальный статус thinking или process-liveness. Поля display payload и вопроса описаны в [контракте Pi](pi-text-harness.md) и [types.ts](../../../src/types.ts).

`reply` обращается к optional `HarnessPort.reply`. Отсутствие операции даёт `rejected`; исключение порта — `unknown`, без раскрытия причины. Ошибки admission остаются `CoreError`: `closed`, `session-not-found`, `invalid-state`. Они отделены от исхода доставки ответа. Неверный request ID/method и другие проверки конкретного native запроса выполняет adapter, не новый send.

`ReplyOutcome` различает `written`, `rejected`, `unknown`. `written` — только локальная запись, не native ACK или доказательство потребления. Ответ не меняет статус/ID ввода, не считается settlement и не отменяет запрет второго send при pending/unknown. При пересечении с stop или сменой поколения поздний результат reply даёт unknown, не восстанавливая сессию. Автоматических ответов, retry/replay/fallback нет.

Вопрос зарегистрирован adapter до публикации: subscriber может немедленно вызвать reply. Несколько concurrent request IDs одной сессии не заменяют друг друга. Публичные новые варианты readonly; вложенные display/question payload клонируются и глубоко замораживаются, не предоставляя mutable доступ к request/adapter state.

## Остановка и завершение работы

`HarnessPort.stop` возвращает различимые `confirmed`, `rejected`, `unknown`; исключение преобразуется в `unknown`.

| Исход stop | Наблюдаемое поведение |
| --- | --- |
| `confirmed` | Сессия становится `stopped`; ожидающий ввод становится `unknown`, а не завершённым. |
| `rejected` | Публичный stop сообщает `harness-rejected`; остановка не подтверждается. Без прежней неопределённости снимается запрет sends, если состояние позволяет отправку. |
| `unknown` | Сессия становится `unknown`, ожидающий ввод — `unknown`; stop сообщает `harness-unknown`, новые sends запрещены. |

Для `created` остановка подтверждается локально, без порта. Stop уже `stopped`
отклоняется; для `failed` он отклоняется в in-memory режиме, а native cleanup может
обратиться к owned harness. В native-режиме clean snapshot записывается до stopped
completion. Admission fence reopen/delete держится через checkpoint, все stop
публикации и результат, включая local-created и cached-stop-proof пути. Пока stop выполняется, новый запрос cleanup может вернуть `unknown`, не вызывая порт повторно и не присоединяясь к текущей попытке.

После завершившейся неопределённой попытки новый явный `stop` или последующий первый `shutdown` достигает harness. Исход новой попытки отражается честно; её `rejected` не отменяет предыдущую неопределённость и запрет sends. Автоматических retry, replay и fallback нет.

`shutdown()` сразу закрывает приём: create/catalogue/register/start/send/cancel/reply/stop/delete/get/list/subscribe после этого сообщают `closed`. Уже начатые операции могут завершиться. Ядро обходит собственные сессии и пропускает уже `stopped`; в in-memory режиме
также пропускает `failed`. Для остальных выполняет cleanup. Native unowned dirty
records не исключаются из отчёта: они попадают в uncertain, не вызывая stop чужого процесса.

Сводка содержит `stoppedSessionIds` только для подтверждённых в этом обходе остановок, `uncertainSessionIds` для неопределённых и `failedSessionIds` для отклонённых. Она не является историей и не гарантирует завершения модели или всех конкурентных операций.

Повторный shutdown возвращает тот же сохранённый Promise и результат, не запускает новый обход. После closed нельзя вызвать новый публичный stop; неопределённая сводка не обещает повторной очистки через уже закрытое ядро.

## Ошибки, проекции и подписчики

`CoreError.code` различает `closed`, `duplicate-session`, `session-not-found`, `invalid-state`, `input-in-flight`, `duplicate-input`, `harness-rejected`, `harness-unknown`, `storage-failed`, `native-invalid`, `native-owned`. Необработанные исключения порта и их причины не передаются потребителю. Неопределённый исход send отражается в статусе ввода, а не выдаётся за подтверждение.

Публичные представления и события не раскрывают внутренние записи, private diagnostics/config, raw RPC, stderr или сохранённый промпт. Представления и объекты событий заморожены; изменение полученного массива list не меняет карту сессий. Ядро не логирует промпты. Явные text/tool/question/notification display payload не фильтруются на секреты: они могут содержать чувствительный текст модели или инструмента. Это не доступ к private adapter records.

Каждая публикация любого типа (`session`/`input`/`text`/`tool`/`question`/`notification`) фиксирует набор получателей при publish (постановке в очередь); каждому из них событие доставляется не более одного раза. Изменения подписок влияют только на последующие публикации: отписка не отменяет уже зафиксированную доставку, включая ещё ожидающую в очереди.

Вложенные синхронные публикации, в том числе межтиповые и межсессионные, доставляются FIFO в порядке publish после доставки предыдущего события всем его зафиксированным получателям. Очередь относится только к текущей доставке, не предоставляет историю или replay.

Синхронное исключение подписчика и отклонение возвращённого им Promise изолируются: они не прерывают ядро и остальных подписчиков. Доставка не ожидает асинхронного завершения слушателей. Это не sandbox и не защита от callback, который не возвращается или бесконечно порождает новые события.

## Долговечность и восстановление native registry

Долговечные barriers: create/register intent, start intent перед launch/resource effects,
used input ID перед prompt, подтверждённый binding перед readiness success, delete intent
перед unlink и clean-stop snapshot перед подтверждением durable clean completion.
Metadata I/O вызывается на command boundaries, не через subscriber. Save failure не
разрешает незаписанный новый эффект или ложный clean success. Cleanup genuinely owned
child остаётся доступен; уже наблюдённый stop proof может использоваться следующей
явной попыткой сохранения после восстановления записи, без повторного port.stop.

Clean registry восстанавливается без запуска модели, включая пустую never-launched запись
и текущий input outcome. Dirty starting/running/failed/unknown записи восстанавливаются
как unknown, их input — консервативно unknown. Новый daemon не получает ownership
прежнего child: произвольный confirmed нового port.stop не доказывает его остановку.
Нет сохранённого PID adoption/kill, автоматических repair/retry/replay или completed invention.

Canonical state/native roots заняты exclusive `.llm-sessiond.lock` (`wx`, mode0600);
одинаковый root захватывается один раз. Второй compliant daemon с любым общим root
отказывает до командных эффектов. Partial acquire/load failure откатывает только свои
locks; ошибка listener startup использует Core cleanup и закрывает listener. После
clean shutdown locks освобождаются; uncertain/failed cleanup и crash leftovers остаются
fail-closed. Автоматического stale takeover нет: оператор независимо доказывает отсутствие
старого writer/child перед безопасным recovery собственных каталогов. После recovery
dirty record по-прежнему не является доказательством ownership.

Native binding проверяется как canonical regular non-hardlinked file с точными identity,
header UUID/cwd, структурой истории и обязательными известными context payloads.
Missing/corrupt/replaced/неоднозначная история не заменяется пустой. Metadata filenames
с lowercase base32/prefix сохраняют case-sensitive ID semantics и Windows-safe addressing.

Registry хранит только текущие metadata, binding, поколения/used IDs и delete intent.
Clean-stop/restart — гарантия сохранения текущего outcome; каждый live terminal/SSE event
не журналируется. Crash-consistent outcome snapshots, event history/replay, ревизии домена
и собственная история разговора не предоставляются. Locks не координируют сторонний Pi,
игнорирующий их, и не защищают от hostile same-user filesystem mutation. Нет sandbox,
secure erase всех следов, rollback tool effects или гарантии descendant/remote cleanup.

## Ограничения и нецели

Вне поверхности: SQLite, permissions engine, универсальный callback-протокол, controls модели/effort/reload, каталоги моделей и settings controls, команды расширения, изображения, планирование, цикл агента, нативные адаптеры, CLI, HTTP/WS/API-версии, SDK, реестры возможностей и query-контроллеры. Они не являются требованиями этого контракта.

Lifecycle/admission authority и интерфейсы находятся в types.ts/core.ts/events.ts/harness-session.ts.
Конкретный disk I/O и validation вынесены в [native-registry.ts](../../../src/native-registry.ts),
[native-history.ts](../../../src/native-history.ts), [native-context.ts](../../../src/native-context.ts);
это не второй lifecycle engine. Нет наследования (кроме публичной ошибки
`CoreError extends Error`), forwarding-классов или универсального движка для будущих сценариев. Ясность и связность важнее счётчика строк. Новые гарантии и расширения требуют отдельного одобрения, а не выводятся из этой документации.

## Проверка изменений

Подготовка окружения и минимальный проверенный сценарий: [README](../../../README.md).

`npm run typecheck` и `npm test` проверяют фактическое ядро с тонким поддельным `HarnessPort`, без модели и платных SDK. Регрессии включают обычный поток, точные ID, раннее завершение, изоляцию сессий, stale events, явную cleanup после uncertainty, concurrent/reentrant вызовы, изменения подписок, фиксацию получателей при enqueue, FIFO вложенных событий всех типов и ошибки подписчиков. Также проверяются startup observations, immutable display payloads, немедленный reply из subscriber, concurrent question IDs, точные response frames и честные local-written/unknown исходы.
Native regressions охватывают empty registry, import/ownership/aliases, no-reset history
validation, used IDs/generation fences, pre-effect write failures, dirty/unowned restore,
stop-proof retry, stopped-only delete/partial retry и fail-closed locks/startup rollback.
[External API test](../../../test/native-api.test.ts) проходит через реальные Core/adapter/HTTP/SSE
с fake Node child. Bounded real Native Pi Linux validation подтверждает clean daemon restart,
exact file/UUID reopen, completed recall без повторения marker и stop/delete с сохранением
unrelated file и observed owned exits. Это не универсальная provider/platform гарантия.
