# Постоянные native-сессии

**Статус:** выполнено. Функциональная валидация, независимый code review и required CI пройдены; durable surfaces согласованы с текущей реализацией. Документ сохраняется для проверки complete-state перед удалением по метаконтракту.

## Цель и сценарии

Полный наблюдаемый цикл: создать или зарегистрировать существующую native Pi session из доверенного каталога, запустить и остановить, корректно перезапустить daemon, явно открыть ту же сессию с контекстом и удалить её.

## Интерфейсы и ограничения

Pi хранит стандартную историю и контекст; daemon хранит только долговечный registry, binding и подтверждённые метаданные, без копии messages и ручного replay. Stop сохраняет историю. Повторное открытие не подменяет существующую сессию пустой; пустые записи registry сохраняются, пропавшая или невалидная история не заменяется новой. Native paths и private config не входят в HTTP DTO и не принимаются как произвольный API input. У binding один владелец; сохраняются идентичности источника, поколения и использованных input, неизменяемость событий.

Удаление допустимо только после подтверждённой остановки и при отсутствии операций; оно удаляет зарегистрированный native file и нашу запись, но не произвольные пути. Частичный или неудачный результат на диске не объявляется полным успехом. Откат tool effects, remote cleanup и secure erase всех следов не гарантируются.

После корректного restart registry восстанавливается без автоматического запуска модели. Pending/uncertain после аварии не становятся completed; сохраняется честный unknown. Явные доказанные stop и reopen разрешают новый input, не переписывая старый исход. Нет adoption или kill чужого PID, автоматического retry/replay и общего orphan/process engine.

## Нецели

Собственная история, ручное восстановление разговора, универсальное управление чужими процессами и гарантии удаления удалённых эффектов не входят в контракт.

## Приёмка

Внешний HTTP/SSE клиент получает completed marker, выполняет clean stop/shutdown, запускает новый daemon и открывает ТУ ЖЕ native session; recall подтверждает контекст без повторения marker. Затем выполняются explicit stop/delete и проверка сохранности посторонних файлов. Проверяются пустой registry и ошибки отсутствующей/невалидной истории и частичного удаления.

## Валидация

Полный Linux suite (baseline 1385+), typecheck, проверка документации; portable external API fake smoke на actual Linux и Windows; независимый review и приёмка parent. Native Linux: всего не более 3 запусков Pi и 3 коротких user inputs, только owned temp, без платных повторов. Неизвестные блокирующие диалоги: STOP и запрос решения, без автоответов. Required checks/pins/strict guard не меняются; Native Windows и универсальная поддержка provider не гарантируются. После валидации согласовать durable contracts; complete → verify → delete по метаконтракту.

## Выполненная валидация

- Linux: typecheck, полный suite1870/1870, оба external HTTP/SSE fake-native smoke, docs checker и diff checks.
- Actual CI: Ubuntu/Windows external API smoke (включая persistence/restart/delete), Linux checks и secret scan успешны.
- Bounded real Native Pi Linux: два owned запуска/два коротких inputs; clean daemon restart, тот же file/native UUID, completed context recall без повторения marker, stop/delete и сохранность unrelated file. Owned exit/close и clean shutdown всех трёх daemon подтверждены; никаких вопросов/hidden retries.
- Проверка complete-state документации и последующее удаление только этого temporary feature contract выполняются отдельными последовательными шагами. S2/S3 не реализованы; Native Windows, full-suite Windows и universal provider/auth не заявлены.

## Поверхности

[Ядро](../surfaces/session-core.md), [Pi harness](../surfaces/pi-text-harness.md), [daemon API](../surfaces/local-daemon-api.md).
