# Командный CLI-клиент локального API

## Статус

Контракт утверждён; реализация не начата. Разрешена только запись договора, не implementation plan, код или тесты. CLI entrypoint и npm script клиента пока не существуют; текущий `npm start` запускает daemon. Следующие scout/implementation/review требуют отдельного разрешения.

## Цель и наблюдаемое поведение

Добавить в тот же репозиторий обычную машинно-читаемую командную утилиту HTTP/JSON + SSE: эталонный клиент и интерфейс для shell/external automation. Это не интерактивный чат или TUI. Клиент отражает существующий API и сохраняет полные результаты, не становясь новым harness.

## Сценарии

- Клиент явно управляет локальными сессиями через create/list/get/start/stop/shutdown.
- command передаёт native JSON, compact — штатные optional инструкции, reply — явный API JSON ответа на вопрос; ответы не сужаются.
- events передаёт существующий SSE, включая ready, как NDJSON; готовность подписки не означает готовности Pi или завершения run.
- Native success:false остаётся полным HTTP200 результатом; API HTTP failure и transport failure отличаются exit code, не новым протоколом ошибок.
- Неверные CLI arguments/config/JSON отклоняются с безопасной диагностикой. Для daemon с config port0 клиент использует actual bound port через --port.
- Disconnect не вызывает скрытый stop/shutdown, retry/reconnect или автоматический ответ на UI question и не доказывает отсутствия эффекта команды.

## Нецели

Не менять production behavior API/Core/Pi или их интерфейсы ради клиента. Нет SDK, прямых imports Core/Native SDK, обхода API, прямого запуска daemon/Pi, собственных history/queue/run-state controllers или эмуляции отсутствующих Native RPC операций. Нет package rename, установки/global command или SDK distribution. Только новый клиент, документация и необходимая fake validation будущей реализации.

## Затронутые поверхности

- [Локальный daemon API](../surfaces/local-daemon-api.md) — существующая нормативная HTTP/JSON + SSE граница.
- [Session Core](../surfaces/session-core.md) и [Pi harness](../surfaces/pi-text-harness.md) — неизменяемые ограничения владения и семантики.
- После реализации новая coherent CLI surface будет описана в `docs/contracts/surfaces/api-cli-client.md`; сейчас файл/stub не создаётся.

## Интерфейсы и ограничения

| Операция CLI | Существующий API |
| --- | --- |
| create | POST `/sessions` |
| list | GET `/sessions` |
| get | GET `/sessions/:sessionId` |
| start | POST `/sessions/:sessionId/start` |
| stop | POST `/sessions/:sessionId/stop` |
| shutdown | POST `/shutdown` |
| command | POST `/sessions/:sessionId/command` |
| compact | POST `/sessions/:sessionId/compact` |
| reply | POST `/sessions/:sessionId/reply` |
| events | GET `/events` |

- command/reply читают native/API JSON через stdin. compact принимает optional JSON с `customInstructions` по существующему строгому body: `{}` либо `{"customInstructions":"..."}`. Native параметры не подменяются; streamingBehavior/queue defaults клиент не добавляет.
- stdout содержит полный JSON полученного результата или ошибки существующего API без дополнительной CLI envelope. Для events stdout — NDJSON объектов `{event,data}` существующего SSE, не новый event protocol.
- stderr — только безопасная диагностика: без token/config/private exception/body dumps. Native payload в stdout — явный product output; secret filtering не обещается.
- Подключение использует существующий приватный config с token/port. `--port` позволяет задать actual bound port, в том числе при daemon config port0. Native launch fields клиент не исполняет. Token не передаётся через argv/env/URL; существующие loopback/auth/privacy/transport ограничения API сохраняются.
- Exit codes обычных результатов CLI: **0** — получен HTTP200, включая native `success:false`; **1** — API HTTP failure или transport failure; **2** — ошибка CLI arguments/config/JSON. Дополнительные статусы/протокол ошибок не вводятся. Exit0 не означает Native success, run completion или all-cleaned; ACK не completion, reply written не consumption.
- Нет automatic retry/reconnect/stop или автоматических UI answers. Явный CLI start вызывает HTTP start: Pi запускает daemon, не клиент. Disconnect не гарантирует отсутствия эффекта и не вызывает скрытый stop/shutdown.
- Прямой запуск — через Node24. Если будет добавлен optional npm script client, машинный вызов — `npm run --silent client -- ...`; npm banner без `--silent` не является output CLI. Существование будущего entrypoint/script сейчас не утверждается.

## Приёмка

1. Все десять операций доступны как обычные команды и отражают указанные API routes без изменения API/Core/Pi behavior или прямого запуска процессов клиентом.
2. command/reply stdin и optional compact JSON сохраняют согласованную форму; native параметры, full success/error/optional response metadata передаются без подмены/defaults/сужения.
3. stdout JSON и events NDJSON пригодны для shell/external automation; API errors сохраняются полностью, CLI envelope не добавляется. Диагностика и config/token не смешиваются с product output.
4. Config и `--port` работают с actual bound port; auth/loopback/transport/privacy границы не ослабляются, native launch settings не исполняются клиентом.
5. Exit codes 0/1/2 соответствуют указанным исходам, включая HTTP200 native success:false. ACK, written и shutdown summary не получают выдуманных гарантий completion/consumption/all-cleaned.
6. SSE ready, явный reply и explicit lifecycle доступны без скрытых UI answers, reconnect/retry/stop/shutdown и собственных history/queue/run-state controllers. Клиент не повторяет запрос из-за разрыва.
7. Клиент запускается через Node24; если добавлен npm script, silent-вызов сохраняет чистый machine stdout. Документация и fake проверки соответствуют реализации; существующие CI guards/protections не ослаблены.

## Будущая валидация

Это требуемые проверки будущей реализации, не отчёт о выполнении. Настоящий CLI subprocess → настоящий daemon → Node fake child должны проверить операции, JSON/native error/optional metadata preserving, exit codes, SSE NDJSON/readiness, explicit reply, lifecycle/no-hidden-effects и privacy, включая args/config/JSON/API/transport errors и port override.

Linux/Windows внешний smoke выполняется в существующем CI без ослабления both-platform guard, `checks if:always()`, gitleaks и admin/strict protections. Typecheck, full fake suite, docs checks, independent review и verified protected delivery всей фичи требуются позже.

Новых Native/model/provider кампаний в этой фиче нет; остаток Native budget4 не расходуется. При записи договора выполняются только doc checks, без runtime suite/build/daemon/Pi. Следующий шаг — отдельно одобренный scout plan по сохранённому контракту, не implementation plan внутри этого документа. Жизненный цикл договора — по [метаконтракту](../meta-contract.md).
