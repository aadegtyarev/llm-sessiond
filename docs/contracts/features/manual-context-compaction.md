# Ручное сжатие native-контекста

**Статус:** согласовано; реализация и приёмка не выполнены.

## Цель и сценарии

Явный штатный native compact с необязательными instructions допускается только при idle; активный input не прерывается скрытым abort. Pi сам суммирует и записывает стандартную историю.

## Интерфейсы и ограничения

Исход операции подтверждается либо честно сообщается отказ или unknown. Последующие send и reopen используют native context после compaction. Побуквенная сохранность всех данных не обещается; малый или пустой контекст и native refusal обрабатываются честно.

## Нецели

Нет собственного summarizer, переписывания истории или скрытой отмены активного ввода.

## Приёмка

Настоящий native compaction, затем продолжение существенных фактов без ручного replay и reopen; отдельно проверены малый/пустой контекст и честный native refusal. Owned test cwd может использовать небольшой native compaction threshold, не отключая ресурсы или loop.

## Валидация

Полный Linux suite (baseline 1385+), typecheck, проверка документации; portable external API fake smoke на actual Linux и Windows; независимый review и приёмка parent. Native Linux: не более 1 Pi process, 2 коротких user inputs и 1 manual compaction, без дополнительных платных кампаний. Неизвестные блокирующие диалоги: STOP и запрос решения, без автоответов. Required checks/pins/strict guard не меняются; Native Windows и универсальная поддержка provider не гарантируются. После валидации согласовать durable contracts; complete → verify → delete по метаконтракту.

## Поверхности

[Ядро](../surfaces/session-core.md), [Pi harness](../surfaces/pi-text-harness.md), [daemon API](../surfaces/local-daemon-api.md).
