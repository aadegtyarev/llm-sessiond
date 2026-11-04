# Core types module name

Статус: одобрено оператором, до реализации.

## Цель и сценарии

Переименовать `src/contracts.ts` в `src/types.ts`; потребители используют новое имя модуля.
Содержимое модуля и поведение остаются побайтно неизменными, старое имя не поддерживается.

## Границы и поверхности

Затронуты [ядро](../surfaces/session-core.md) и [Pi harness](../surfaces/pi-text-harness.md).
Разрешены только rename, замены import/export путей и текущих Markdown ссылок/названий.
Нецели: shim, перенос CoreError, изменение типов/логики, форматирование, зависимости, CI и другие фичи.

## Acceptance

Blob нового модуля равен прежнему; остальные итоговые изменения — только замена `contracts.ts` на `types.ts`.
Временный контракт после проверки помечается complete, проверяется и удаляется из итогового дерева.

## Validation

Проверить exact base, blob/substitution predicates, отсутствие старых imports, typecheck, все 1184 теста,
docs checker и diff-check. Не запускать модели или real Pi, не менять donor dependencies.
Для merge нужны actual required checks на exact final head, неизменный main и отсутствие blocking review/conflicts.
