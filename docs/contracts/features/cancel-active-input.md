# Отмена активного ввода с продолжением разговора

Статус: реализация и целостная приёмка завершены; документ подлежит удалению после проверки lifecycle.

## Цель

Отменить конкретный активный input без уничтожения или перезапуска Native Pi, затем продолжить тот же разговор в той же сессии и owned Pi PID с контекстом ранее завершённых сообщений. Это одна цельная end-to-end фича Core → adapter → HTTP/SSE, не отдельные поставки этих слоёв.

## Затронутые поверхности

- [Ядро сессий](../surfaces/session-core.md).
- [Native Pi text harness](../surfaces/pi-text-harness.md).
- [Локальный daemon API](../surfaces/local-daemon-api.md).

Процесс разработки и жизненный цикл документа определяют [контракт разработки](../development.md) и [метаконтракт](../meta-contract.md).

## Интерфейсы и наблюдаемые сценарии

- `Core.cancel(sessionId, inputId)` отменяет только указанный активный ввод; HTTP: `POST /sessions/:id/cancel` с JSON `{inputId}`. Существующие HTTP/Bearer auth, validation boundary и ограничения безопасности сохраняются.
- Отдельный терминальный статус ввода `cancelled` публикуется только при доказанном завершении отменённого native input. Запрос отмены, локальная запись и ACK сами по себе не settlement.
- После доказанного `cancelled` допускается новый send в той же сессии и owned Pi PID без потери контекста завершённых сообщений.
- Неверная сессия/ID, stale, concurrent или late запрос и поздний ACK отмены A не должны abort или изменить следующий Core input B.
- Если ввод естественно завершился раньше, отмена не переписывает его исход. Ранний terminal не затирается поздним ACK.
- При потере канала или недоказанном завершении исход — `unknown`, следующий send заблокирован; cleanup требует explicit stop. Rejected/unsupported операция не выдаётся за отмену.
- Дубли, пересечения cancel со stop/shutdown и неподтверждённая отправка не обходят admission, точное владение input или существующие stop/shutdown semantics.

## Ограничения

- Native Pi 1.5 владеет loop/resources/tools/skills/MCP/extensions/templates. Используется штатный RPC abort: `session.abort → agent.abort → waitForIdle`; `agent_settled.aborted` — native control field. Новое cancellation evidence должно быть обосновано исходниками и протоколом, а не предположением по ACK.
- Источники проверки: `/home/adegtyarev/.pi/agent/install/releases/1.5.0/node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-mode.js` и `dist/core/agent-session.js` того же пакета.
- Adapter не становится generic unconditional abort gateway: сохраняется точное владение Core input/run через started ACK и причинную границу. Unknown/handled/queued/unowned runs нельзя присваивать вводу.
- Существующие completed/failed проверки обязательного assistant DTO и stopReason не ослабляются. Malformed/unproved evidence не означает успех. Abort во время tool может оставить последним assistant с toolUse; consumption или локальный ACK нельзя имитировать как terminal.
- Сохраняются source generation, FIFO, recipient snapshot, deep-readonly payloads, reentry, listener error isolation, не более одного незавершённого input и stop/shutdown semantics. Production Core/interface остаются в четырёх существующих файлах; связность и ясность важнее счётчика строк, допустимы цельные 150–200 строк.
- Нет auto hard-stop/restart/retry/replay, очистки контекста или восстановления истории. Выполненные tool effects не откатываются; остановка внешних MCP, descendants, remote jobs и игнорирующих abort tools не обещается.
- Нет новых runtime dependencies, SDK, переписывания loop, generic engine/registry, второго event bus или исторических реализаций. Donor node_modules неизменен; install не выполняется.
- Нельзя менять соседние проекты, global settings, Pi installation, deployment, службы, protections или merge policy. Native resources не отключаются; неизвестный блокирующий диалог требует остановки и обращения к оператору, а не автоответа на чужой UI request.
- Public claims доказываются только через HTTP/SSE; diagnostics разрешены лишь для safety, PID и native evidence. Не раскрываются tokens, auth files, private exceptions/config, raw RPC или stderr. Существующее предупреждение о чувствительном display text сохраняется.

## Приёмка

1. Внешний HTTP/SSE клиент завершает первый turn с контрольным маркером, затем запускает длительную операцию и отменяет именно её input. Получает доказанный `cancelled`, а не shutdown.
2. Новый input получает ответ с исходным маркером из контекста. Recall prompt не повторяет маркер; ручного replay или SDK history copy нет. Session и Native PID остаются теми же. Затем explicit stop, observed owned exit и shutdown подтверждают cleanup.
3. Длительная операция — bounded benign native wait, учитывающая native AbortSignal; file effects только в owned temp. Проверка использует штатный tool loop, одну новую real-Pi Linux session и максимум три user inputs. Первая разрешённая проверка выполнена и завершилась FAILED. Оператор явно разрешил ровно одну дополнительную такую сессию, не более трёх user inputs; всего разрешены две сессии, дальнейшие платные retries/campaigns не разрешены.
4. Fake-регрессии охватывают exact target, гонки, early terminal, late abort ACK и неизменность B; pending ACK/unknown/unsupported admission; дубли и cancel vs stop/shutdown; cooperative/incomplete/malformed/channel-loss исходы. Без доказанного settlement следующий input не освобождается.
5. Ошибки fixtures обязательно проверяются снаружи Core/Port/subscriber isolation: существующий fixtureHealth расширяется на новую операцию, assertions не скрываются в callback. Timing контролируется причинными сигналами; environmental allowances не увеличивают short fault budget здорового actor.
6. Вся фича и новый API seam поставляются целиком в одном PR. Готовность требует проверок ниже и итоговой приёмки; запись этого контракта сама по себе не означает готовность фичи.

## Валидация

- Полный Linux suite (исходная база 1335+ тестов), typecheck и docs check; новые fake-регрессии проверяют весь класс отмены и существующие инварианты.
- Тот же portable external API smoke расширяется cancel → continue сценарием и проходит на Linux и actual Windows CI. Windows использует portable Node, не Linux paths. Full Native Windows не обещан.
- Одна дополнительно разрешённая bounded real-Pi Linux проверка выполняет HTTP/SSE сценарий приёмки без дальнейших повторов и платной кампании. Недоказуемое обещание, отсутствующая foundation или неизвестный блокирующий диалог требуют остановки и решения оператора.
- Сохраняются exact required checks, gitleaks, smoke needs/always fail guard и pinned actions. Все обязательные проверки должны иметь actual COMPLETED SUCCESS для точного HEAD; bypass, rerun/cancel chase-green не допускаются.
- Итоговый целостный diff проходит свежий независимый configured reviewer review и parent acceptance. После успешной валидации и приёмки все три durable surface contracts сверяются и обновляются; feature contract отмечается завершённым, проверяется и удаляется по метаконтракту. Завершение — normal protected squash без deployment.

## Нецели

UI, harnessd, Telegram, Claude Code, models/catalogs, persistence, reconnect/replay, SDK, sandbox, rollback, общий permissions engine или remote process engine. Не обещаются остановка всех фоновых ресурсов, универсальная native parity или full Native Windows certification.
