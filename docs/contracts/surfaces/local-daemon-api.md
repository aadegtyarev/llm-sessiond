# Локальный daemon API

## Граница и нормативные справочники

Внешний клиент управляет сессиями через HTTP/JSON и SSE без импорта TypeScript. Один daemon владеет одним [Core](session-core.md) и модулями [Pi](pi-text-harness.md)/[Claude](claude-code-harness.md); default — Pi. Native CLI владеет моделью, tools, permissions, историей, очередью и настройками.

TCP listener доступен только на `127.0.0.1`. Нет remote bind, Unix socket/named pipe, CORS, browser UI или публичного health endpoint без auth.

Полные [config](../../daemon-config.md), [HTTP справочник](../../api-reference.md), [события](../../events.md), [native команды](../../native-commands.md) и [безопасность/проверки](../../safety-and-validation.md) — обязательные части контракта. [Руководство](../../local-daemon-api.md) даёт порядок действий, не альтернативную спецификацию.

## Конфигурация и readiness

Node.js 24 CLI читает приватный config из stdin до EOF. [Схема](../../../src/daemon-config.ts) не импортирует backend runtime; launch задаёт доверенный оператор. Composition регистрирует только `pi` и `claude-code`; HTTP selector не выбирает executable/import path. Неизвестные поля и config IDs отвергаются до эффектов. Поля, defaults и приоритеты заданы в [config reference](../../daemon-config.md#поля).

Каждый запрос, включая SSE, требует bearer: loopback не заменяет auth. Token не передают через argv/env/URL/log или Native startup config; Windows требует приватный ACL.

`listening.host/port` подтверждает bind; SSE ready — подписку. Регистрация, listener, list и create не запускают Native. **Start запускает child с native ресурсами/hooks и его правами, не sandbox.** Pi readiness требует успешный get_state с object data, Claude — initialize success. Spawn/таймер не readiness; initialize не прогрев модели.

При ошибке запуска listener закрываются Core и listener, чужие процессы не усыновляются. После restart список пуст; native files/metadata/locks daemon не читает, не мигрирует и не удаляет.

## Запросы и результаты

API предоставляет [десять маршрутов](../../api-reference.md#маршруты); POST требует JSON object, включая `{}`. Command доступен только running без stop, Pi reply также starting. Параметры проходят без native domain policy, defaults, file guards или readback. Отсутствующие Native операции не эмулируются.

Полные Pi responses и Claude control responses, включая native ошибки, возвращаются HTTP200. One-way written означает только local callback+drain; result приходит отдельно. Pi-style reply не заменяет полный Claude permission answer; Claude compact отклоняется до write. Точная [интерпретация результатов](../../native-commands.md#результаты) обязательна.

[Ошибки и пределы HTTP](../../api-reference.md#ошибки), [поля, порядок и пределы SSE](../../events.md) определены в справочниках. Подпишитесь до start: вопрос возможен до его HTTP response. Нет replay/resume; payload может содержать секреты, полнота после разрыва не восстанавливается.

## Разрыв и завершение

Разрыв связи не отменяет и не повторяет команду. Ошибка транспорта не доказывает отсутствие эффекта; автоматического retry нет. До shutdown доступны current get/list и явный stop, не event history или idle process-liveness.

Shutdown сразу закрывает admission, возвращает сводку [очистки Core](session-core.md#остановка-и-завершение-работы), затем закрывает потоки/listener. SIGINT/SIGTERM используют тот же путь. Unknown не all-cleaned: child может остаться жив, выход daemon не гарантирован. Полученный response сохраняется, неполученный при loss даёт harness-unknown; поздние callbacks не оживляют источник.

Private config/исключения/stderr не публикуются. Остальные ограничения безопасности, очистки и платформ обязательны по [полному справочнику](../../safety-and-validation.md). [Transport](../../../src/daemon.ts), [routes](../../../src/daemon-routes.ts).
