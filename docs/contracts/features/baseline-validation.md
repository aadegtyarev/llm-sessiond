# Baseline validation

Статус: завершено; проверено родителем и независимым Terra review (ACCEPT).

## Цель
Публикуемый защищённый baseline: работающие required CI checks, контракты текущего поведения и узкая защита от возврата архивных ссылок.

## Поверхности
- [Session core](../surfaces/session-core.md).
- [Pi text harness](../surfaces/pi-text-harness.md).
- Репозиторные CI и AGENTS.md; новая durable surface не требуется.

## Сценарии и ограничения
PR и push main запускают checks (Node 24, clean install, typecheck, tests) и gitleaks без ослабления сканирования. Durable surfaces сохраняют все гарантии и текущие ссылки, но не требуют поиска удалённых feature contracts через git show. Обычные ссылки и совместимость/версии допустимы.
Тест проверяет реальные durable surfaces и положительные/отрицательные примеры архивных ссылок; meta/process docs не сканируются. Автоматические fake-protocol проверки не объявляются полной native parity; реальные запуски требуют отдельного consent.

## Не-цели
Никакого нового product/API behavior, rename, interaction, deployment, dependency/toolchain/runtime изменений. src/, package/lock/tsconfig и существующие тесты неизменны. Squash-only policy, protections и canonical meta-contract не меняются. Нет arbitrary file-line ceiling или CI line-limit.

## Приёмка и проверка
- Required jobs checks/gitleaks восстановлены совместимыми pinned actions из main.
- Только durable surfaces очищены от исторической provenance, без потери гарантий.
- Repo-local AGENTS.md запрещает архивные ссылки и policy changes ради них.
- Новый узкий Node doc regression принимает current links и отвергает git-show/deleted feature references.
- Focused test, полный typecheck/tests, Pi sentinel 1032, docs checker и diff scope проходят; actual GitHub checks проверяются на pushed SHA.
- Donor и исходный interaction checkout не меняются; meaningful commits и обычный fast-forward push только в PR #3.
Финальная проверка: typecheck PASS, полный набор 1161/1161, focused guard 11/11, docs checker 6 файлов и diff scope PASS. На принятом implementation head required checks/gitleaks PASS. Первый CI attempt имел недиагностированный сбой существующего fake-child теста; один разрешённый повтор прошёл, причина не установлена. Runtime и существующие тесты не менялись. Временный контракт готов к удалению по lifecycle; финальные checks после удаления проверяются отдельно.
