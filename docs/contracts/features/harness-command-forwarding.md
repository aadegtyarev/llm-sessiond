# Единая передача сообщений и команд harness

## Статус

Согласованное поведение записано; реализация не начата. Это изменение, а не описание уже работающего main. Совместимость старого API не обязательна; локальные результаты и reply без native ACK согласованы. До планирования и реализации нужно утвердить оставшуюся публичную форму входа сообщений/команд, указанную в конце документа. Этот документ не является implementation plan.

## Цель и наблюдаемое поведение

Через существующий Core единообразно передавать все пользовательские сообщения и команды harness и его ответы/события пользователю. Scope не ограничен compact. Нужен простой общий механизм с небольшим количеством кода, не отдельное исключение для саммаризации и не отдельный прозрачный gateway вместо Core.

Пользователь получает полный native response, а не замену через `InputView`, `ControlResult` или придуманные статусы. Выполнением и очередью владеет harness. Wrapper не вводит собственную очередь или idle-only admission для сообщений/команд и не подменяет native acceptance/refusal.

## Сценарии

- Обычное сообщение или команда проходит через Core; полученный native ответ возвращается полностью, включая optional поля и native ошибку.
- Пользователь вызывает compact с пустым body или своими инструкциями; harness выполняет штатный compact и возвращает результат либо собственный отказ.
- При busy или задержанном ответе ordinary send и compact не отклоняются wrapper только из-за занятости или ожидания. Полученные native queued/handled/started либо отказ передаются как есть; ожидание не становится failure или completion.
- Несколько ответов приходят не по порядку отправки. Каждый относится к своему `id`, не к очередному ожидающему вызову.
- Во время работы приходят tool start/update/end и промежуточные события. Они доставляются через существующие события, но не заменяют ответ команды и не доказывают завершение.
- Native `success:false` возвращается целиком с HTTP200. При физическом отсутствии ожидаемого native ответа из-за сломанного канала/остановки возвращается HTTP409 `harness-unknown`; если адаптер не поддерживает compact — HTTP409 `harness-rejected`.
- Локальное управление сессиями и get/list возвращают локальные результаты daemon. Reply на вопрос Pi без native ACK сообщает только локальный исход записи; `{"kind":"written"}` не означает получения или использования ответа Pi.

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

Правило полного ответа общее для сообщений/команд, не только compact. Любой фактически полученный native response, включая `success:false`, возвращается с HTTP200 без подмены API-ошибкой. При отсутствии ожидаемого native ответа из-за сломанного канала/остановки применяется существующая API-ошибка HTTP409 `harness-unknown`. Отсутствие поддержки compact у адаптера — существующая API-ошибка HTTP409 `harness-rejected`, не замена реально полученного native отказа. Семантика unsupported для неизвестных новых интерфейсов этим не определяется.

### Ожидание и native семантика

Корреляция выполняется по `id`, не по arrival order. Ожидание и промежуточное событие не равны завершению; native response не следует выдавать за завершение всего model run. Wrapper отличает сломанный канал от нормального ожидания и не отменяет, не перезапускает и не повторяет команду автоматически из-за ожидания. Не вводятся wrapper queue defaults, новые таймауты или преобразование busy в failure. Правила относятся и к ordinary send, и к остальным командам.

Native Pi 1.5 compact начинает с `await abort()` и не продолжает прерванный run. Это native interruption, не wrapper cancellation. Не обещаются отсутствие такого прерывания или одинаковая FIFO очередь для всех command types.

### События и локальные границы

Существующие `tool_execution_start/update/end` передаются через существующий session-scoped `tool` поток Core → SSE: `toolCallId`, `toolName`; start — `args`, update — `args` и `partialResult`, end — `result`, `isError` и optional `durationMs`. Сохраняются предоставленные ID/name/arguments/intermediate/final result/error indicator в этих формах. Не придумывается input correlation; уже работающие payloads не перепроектируются ради симметрии. Остальные события передаются в согласованных существующих формах, без нового raw-event протокола.

Граница результатов: есть native response — возвращаем его целиком; локальная операция — возвращаем наш результат; reply на вопрос без native ACK — сообщаем только локальный исход записи. Локальное управление сессиями и get/list остаются локальными: `GET /sessions` — список сессий daemon, не команда Pi. Успешный UI response даёт `{"kind":"written"}` только как факт локальной записи в канал Pi, не native success, receipt или consumption. Нормальное отсутствие native ACK у reply не является потерей ожидаемого RPC response и само по себе не даёт `harness-unknown`.

Backward compatibility старых командных URL/body и Core-методов не обязательна: живых потребителей, кроме тестов, нет. Интерфейсы можно менять под единообразную передачу native сообщений/команд, без legacy-слоя или двух параллельных путей ради совместимости. Конкретные новые публичные формы, кроме указанного compact, этим не выбираются.

Существующие access/auth/transport validation и ownership/privacy границы сохраняются. Разрешение менять body/API не разрешает отключить schema validation. Общее forwarding не разрешает обход Core, обращение к чужой сессии или ослабление локального lifecycle/access контроля. Полные native ответы — согласованный product output, не разрешение печатать секреты, private config или diagnostics в логи оркестрации.

## Приёмка

1. Все пользовательские сообщения/команды передаются через существующий Core единообразно; возвращаются полные native responses, включая optional metadata и native errors, без подмены узкими DTO.
2. Compact использует указанный строгий HTTP body и штатную native команду с optional инструкциями.
3. Ordinary send и compact при busy/delayed response не получают wrapper queue/idle-only отказа или ложного failure по ожиданию. Native acceptance/refusal остаются неизменными; нет автоматических cancel/restart/retry.
4. Ответы не по порядку правильно коррелируются по `id`; ожидание и intermediate events не считаются completion.
5. Tool start/update/end доставляются через существующие Core/SSE события с перечисленными полями и session scope.
6. Фактически полученный native отказ остаётся полным ответом HTTP200; потеря канала/остановка без ожидаемого native ответа даёт HTTP409 `harness-unknown`, unsupported compact — HTTP409 `harness-rejected`.
7. Auth/access/ownership/privacy и transport/schema validation не ослаблены при изменении API; native interruption compact не скрывается обещанием продолжить прерванный run.
8. Локальное управление сессиями и get/list возвращают локальные результаты. Reply без native ACK возвращает честный локальный исход записи, без выдуманного native ответа или подтверждения receipt/consumption; штатное отсутствие ACK не трактуется как потеря RPC response. Совместимость старого командного API не является критерием приёмки.

## Валидация

Будущие fake Core/adapter/HTTP/SSE проверки должны покрыть все критерии: полные success/error ответы для ordinary send и команд с optional полями; строгий compact body и инструкции; busy и задержанные ответы ordinary send/compact; native acceptance/refusal; ответы в обратном порядке по разным `id`; промежуточные события без completion; tool start/update/end со всеми согласованными полями; потерю канала/остановку без ожидаемого native ответа, unsupported compact и сохранение access/auth и transport/schema validation. Отдельно проверяются локальные результаты управления сессиями/get/list и reply без native ACK: `written` означает лишь локальную запись, не receipt/consumption; отсутствие штатного ACK не подменяется потерей RPC response. Тесты будущей реализации можно обновлять под согласованное новое поведение без требования совместимости со старым командным API.

Это требуемая будущая валидация, не отчёт об успешном прогоне. При записи договора выполняются только doc checks. Runtime/tests/build/daemon/Pi/model generations не запускаются; новая Native-валидация требует отдельного разрешения.

## Открытый публичный вопрос

Какова конкретная публичная форма входа всех native сообщений/команд помимо согласованного compact: HTTP URL/body и вход Core для команды и её параметров, включая параметры native busy-поведения ordinary send? Совместимость старого API не требуется, но новые URL/body/envelope ещё не выбраны.

Этот вопрос не сужает одобренный scope «для всего» и не разрешает compact-only реализацию. Он блокирует утверждение целиком выполнимого публичного контракта для начала разработки по [контракту разработки](../development.md).
