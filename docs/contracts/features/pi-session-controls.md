# Управление настройками и reload Pi-сессии

**Статус:** согласовано; реализация и приёмка не выполнены.

## Цель и сценарии

Native catalogue моделей и поддерживаемые уровни thinking/effort, выбор model/effort для отдельной сессии штатными методами Pi и readback фактических настроек, а не echo/ACK. При reopen authoritative native session; global defaults не меняются, недоступное не заменяется автоматически.

## Интерфейсы и ограничения

Настоящий штатный `context.reload` выполняется в том же Pi PID и native session без потери контекста и выбранных settings, не подменяется restart. Reload допускается только в quiescent session; конфликтующие операции отклоняются либо честно дают unknown, stale UI/источники не replay. Core/HTTP предоставляют именованные операции только для этих controls; отсутствующий или ошибочный reload helper не попадает в prompt модели.

Источник выполнимости: harnessd `src/harness/pi-reload-extension.ts` вызывает `await context.reload()`; `pi-rpc-harness.ts:1021+` проверяет private command/handled/error. Применим только этот небольшой принцип native extension, без переноса framework, SDK или harnessd integration. Штатный Pi `AgentSession.reload` пересоздаёт native resources на месте, не процесс.

## Нецели

Нет raw-RPC/command gateway, plugin install/config-edit API, изменения глобальных defaults или автоматического fallback.

## Приёмка

Проверены выбор моделей, поддерживаемые effort, фактический readback и reopen. Owned plugin fixture v1 → v2 подтверждает reload в том же PID/native ID с сохранением контекста и settings; обычные send/cancel/reply продолжают работать. Ошибки helper не превращаются в запрос модели.

## Валидация

Полный Linux suite (baseline 1385+), typecheck, проверка документации; portable external API fake smoke на actual Linux и Windows; независимый review и приёмка parent. Native Linux: не более 1 Pi process, без user generation; non-inference native evidence и fake/source tests. Если честная проверка требует дополнительных платных prompts/processes, до расхода нужно одобрение parent. Неизвестные блокирующие диалоги: STOP и запрос решения, без автоответов. Required checks/pins/strict guard не меняются; Native Windows и универсальная поддержка provider не гарантируются. После валидации согласовать durable contracts; complete → verify → delete по метаконтракту.

## Поверхности

[Ядро](../surfaces/session-core.md), [Pi harness](../surfaces/pi-text-harness.md), [daemon API](../surfaces/local-daemon-api.md).
