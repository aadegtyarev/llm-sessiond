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

Полный Linux suite (baseline 1385+), typecheck, проверка документации; portable external API fake smoke на actual Linux и Windows; независимый review и приёмка parent. Для оставшейся Native Linux валидации S2/S3 оператор одобрил общий бюджет: не более 50 НОВЫХ validation generation requests суммарно, включая manual compaction и summaries. Генерация допускается только после фактического подтверждения Native selection Luna6.1 либо Luna6; metadata/readiness импортированной истории без inference допустимы на её исходном selection. Pi process counts учитываются отдельно; это заменяет прежние общие S3 лимиты 1 Pi/2 user inputs/1 manual compaction, но не разрешает неограниченные процессы. Parent до эффектов назначает bounded scenario budgets и source/free gates. Не требуется расходовать все 50; не разрешены слепые/автоматические retries, fallback на другую model/provider, auth/global изменения или расширение product scope. Точный S3 evidence plan обновляется после поставки S2 в пределах общего бюджета; реализация S3 сейчас не начинается. Неизвестные блокирующие диалоги: STOP и запрос решения, без автоответов. Required checks/pins/strict guard не меняются; Native Windows и универсальная поддержка provider не гарантируются. После валидации согласовать durable contracts; complete → verify → delete по метаконтракту.

## Поверхности

[Ядро](../surfaces/session-core.md), [Pi harness](../surfaces/pi-text-harness.md), [daemon API](../surfaces/local-daemon-api.md).
