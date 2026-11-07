# Единая передача сообщений и команд harness

## Статус

Согласованное поведение записано; реализация не начата. Это изменение, а не описание уже работающего main. До планирования и реализации нужны ответы на публичные вопросы в конце документа и их явное утверждение. Этот документ не является implementation plan.

## Цель и наблюдаемое поведение

Через существующий Core единообразно передавать все пользовательские сообщения и команды harness и его ответы/события пользователю. Scope не ограничен compact. Нужен простой общий механизм с небольшим количеством кода, не отдельное исключение для саммаризации и не отдельный прозрачный gateway вместо Core.

Пользователь получает полный native response, а не замену через `InputView`, `ControlResult` или придуманные статусы. Выполнением и очередью владеет harness. Wrapper не вводит собственную очередь или idle-only admission для сообщений/команд и не подменяет native acceptance/refusal.

## Сценарии

- Обычное сообщение или команда проходит через Core; полученный native ответ возвращается полностью, включая optional поля и native ошибку.
- Пользователь вызывает compact с пустым body или своими инструкциями; harness выполняет штатный compact и возвращает результат либо собственный отказ.
- При busy или задержанном ответе ordinary send и compact не отклоняются wrapper только из-за занятости или ожидания. Полученные native queued/handled/started либо отказ передаются как есть; ожидание не становится failure или completion.
- Несколько ответов приходят не по порядку отправки. Каждый относится к своему `id`, не к очередному ожидающему вызову.
- Во время работы приходят tool start/update/end и промежуточные события. Они доставляются через существующие события, но не заменяют ответ команды и не доказывают завершение.
- Native `success:false` возвращается целиком с HTTP200. При физическом отсутствии ответа из-за сломанного канала/остановки возвращается HTTP409 `harness-unknown`; если адаптер не поддерживает compact — HTTP409 `harness-rejected`.

## Не входит в задачу

Свой summarizer, agent/tool loop, исполнение инструментов или permissions engine; custom hooks, новый raw-event протокол; замена native очереди, переписывание истории, Pi/SDK patch, provider wrappers, universal pre-dispatch attestation/control framework, отдельный gateway и попутные улучшения. Нет новой Native/generation кампании или бюджета.

## Затронутые поверхности

- [docs/contracts/surfaces/session-core.md](../surfaces/session-core.md)
- [docs/contracts/surfaces/pi-text-harness.md](../surfaces/pi-text-harness.md)
- [docs/contracts/surfaces/local-daemon-api.md](../surfaces/local-daemon-api.md)

Эти контракты описывают текущий main. Новый scope меняет передачу native команд/ответов, сужающие DTO и wrapper concurrency/deadline ограничения, в том числе для ordinary send и остальных команд. Поверхности сейчас не переписываются; их согласование с результатом требуется после проверенной реализации по [метаконтракту](../meta-contract.md).

## Интерфейсы и ограничения

### Compact и полные ответы

`POST /sessions/:sessionId/compact` принимает строго `{}` или `{"customInstructions":"..."}`. Дополнительные поля и нестроковые инструкции не допускаются. Передаётся штатная native команда `compact` с optional `customInstructions`.

Полный ответ сохраняет `id`, `type`, `command`, `success`, `data` либо `error` и все предоставленные harness metadata/optional поля. Пример compact success:

```json
{"id":"req-1","type":"response","command":"compact","success":true,"data":{"summary":"...","firstKeptEntryId":"abc123","tokensBefore":150000}}
```

`summary` и другие поля результата не сужаются: optional `estimatedTokensAfter`, `usage`, `details` также сохраняются, если предоставлены. Пример native failure:

```json
{"id":"req-1","type":"response","command":"compact","success":false,"error":"сообщение harness"}
```

Правило полного ответа общее для сообщений/команд, не только compact. Любой фактически полученный native response, включая `success:false`, возвращается с HTTP200 без подмены API-ошибкой. При отсутствии ответа из-за сломанного канала/остановки применяется существующая API-ошибка HTTP409 `harness-unknown`. Отсутствие поддержки compact у адаптера — существующая API-ошибка HTTP409 `harness-rejected`, не замена реально полученного native отказа. Семантика unsupported для неизвестных новых интерфейсов этим не определяется.

### Ожидание и native семантика

Корреляция выполняется по `id`, не по arrival order. Ожидание и промежуточное событие не равны завершению; native response не следует выдавать за завершение всего model run. Wrapper отличает сломанный канал от нормального ожидания и не отменяет, не перезапускает и не повторяет команду автоматически из-за ожидания. Не вводятся wrapper queue defaults, новые таймауты или преобразование busy в failure. Правила относятся и к ordinary send, и к остальным командам.

Native Pi 1.5 compact начинает с `await abort()` и не продолжает прерванный run. Это native interruption, не wrapper cancellation. Не обещаются отсутствие такого прерывания или одинаковая FIFO очередь для всех command types.

### События и локальные границы

Существующие `tool_execution_start/update/end` передаются через существующий session-scoped `tool` поток Core → SSE: `toolCallId`, `toolName`; start — `args`, update — `args` и `partialResult`, end — `result`, `isError` и optional `durationMs`. Сохраняются предоставленные ID/name/arguments/intermediate/final result/error indicator в этих формах. Не придумывается input correlation; уже работающие payloads не перепроектируются ради симметрии. Остальные события передаются в согласованных существующих формах, без нового raw-event протокола.

Существующие access/auth/transport/schema правила и ownership/privacy границы сохраняются. Общее forwarding не разрешает обход Core, обращение к чужой сессии или ослабление локального lifecycle/access контроля. Оно также не утверждает самостоятельно удаление старых публичных операций или новые интерфейсы вместо них: границы совместимости требуют ответов ниже. Полные native ответы — согласованный product output, не разрешение печатать секреты, private config или diagnostics в логи оркестрации.

## Приёмка

1. Все пользовательские сообщения/команды передаются через существующий Core единообразно; возвращаются полные native responses, включая optional metadata и native errors, без подмены узкими DTO.
2. Compact использует указанный строгий HTTP body и штатную native команду с optional инструкциями.
3. Ordinary send и compact при busy/delayed response не получают wrapper queue/idle-only отказа или ложного failure по ожиданию. Native acceptance/refusal остаются неизменными; нет автоматических cancel/restart/retry.
4. Ответы не по порядку правильно коррелируются по `id`; ожидание и intermediate events не считаются completion.
5. Tool start/update/end доставляются через существующие Core/SSE события с перечисленными полями и session scope.
6. Фактически полученный native отказ остаётся полным ответом HTTP200; потеря канала/остановка без ответа даёт HTTP409 `harness-unknown`, unsupported compact — HTTP409 `harness-rejected`.
7. Auth/access/ownership/privacy и существующие transport/schema ограничения не ослаблены; native interruption compact не скрывается обещанием продолжить прерванный run.

## Валидация

Будущие fake Core/adapter/HTTP/SSE проверки должны покрыть все критерии: полные success/error ответы для ordinary send и команд с optional полями; строгий compact body и инструкции; busy и задержанные ответы ordinary send/compact; native acceptance/refusal; ответы в обратном порядке по разным `id`; промежуточные события без completion; tool start/update/end со всеми согласованными полями; потерю канала/остановку без ответа, unsupported compact и сохранение access/auth границ.

Это требуемая будущая валидация, не отчёт об успешном прогоне. При записи договора выполняются только doc checks. Runtime/tests/build/daemon/Pi/model generations не запускаются; новая Native-валидация требует отдельного разрешения.

## Открытые публичные вопросы

1. Как выглядит полный публичный вход для всех команд помимо согласованного compact: сохраняются ли имеющиеся URL/body, и как передаются остальные native команды и их параметры? В частности, какой вход ordinary send задаёт native поведение при busy, если оно требует параметров? Новые URL/envelope/body здесь не выбраны.
2. Каков согласованный контракт совместимости существующих Core/HTTP операций и проекций (`send`, `cancel`, `reply`, models/settings/model/thinking-level/reload, `get/list` и input/session events) при переходе к полным native ответам? Нужно определить, какие локальные lifecycle/session операции и проекции остаются, как потребитель получает native результаты составных controls, и что возвращает reply без native response. Нельзя придумывать отсутствующий ответ или самостоятельно удалять старые операции.

Эти вопросы не сужают одобренный scope «для всего» и не разрешают compact-only реализацию. Они блокируют утверждение целиком выполнимого публичного контракта для начала разработки по [контракту разработки](../development.md).
