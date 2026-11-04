# Pi protocol validation

Статус: одобрено оператором, активно; реализация и независимый review впереди.

## Цель
Надёжный причинный Pi/RPC test harness и работающий protected CI для принятого baseline без изменения production-поведения. Исправляется весь класс setup/observation/cleanup проблем реальных fake Node subprocess tests, не один timeout.

## Затронутые поверхности
- [Pi text harness](../surfaces/pi-text-harness.md): текущая validation boundary, без изменения native API/гарантий.
- [Session core](../surfaces/session-core.md): сохранение ownership, early-terminal и uncertainty сценариев.
- Только test infrastructure/owned fake fixtures и при необходимости минимальная текущая validation documentation; новая durable surface не нужна.

## Сценарии и наблюдаемые критерии
- Все существующие real-process Pi сценарии сохраняются: positive paths, ACK rejection/uncertainty, malformed final DTO, active channel loss, EOF, stop, stale ordering и cleanup.
- Обычный тест не продолжает send незаметно после unconfirmed readiness. Uncertainty проверяется после доказанного достижения нужной protocol phase, а не из-за неупражнённого prompt.
- Environmental startup/observation allowance отделяется от намеренных deadline/ordering условий; readiness failures и delayed ACK сохраняют исходный смысл. Нельзя просто поднять все deadlines.
- Setup и ожидания причинные, bounded, с явными условиями/phase evidence и полезной nonsecret диагностикой. Cleanup owned child обязателен и наблюдаем даже при setup failure.
- Сохраняются точные assertions, IDs, early-terminal ownership и real child coverage. Добавляются детерминированные delayed readiness, delayed observation и failed-readiness регрессии для всего класса.

## Ограничения и не-цели
src/, package/lock/tsconfig, native API/гарантии и политики frozen. Существующие Pi tests разрешено исправлять только в этом test-harness seam. CI/doc-archaeology guard, squash-only, strict checks/gitleaks и protections сохраняются.
Нет skip/quarantine/deletion сценариев, retries для сокрытия failures, blanket serialization, ослабления assertions до любого исхода, arbitrary sleep как синхронизации или generic process-testing framework. Нет искусственного line ceiling; файлы остаются связными и читаемыми.
Нет моделей/реального Pi/providers, install, donor writes, credentials, global/adjacent/deploy изменений, merge, rename или interaction. Production defect требует отдельного сообщения/решения, не скрытого патча.

## Проверка и критерии приёмки
1. Class mapping всех затронутых сценариев и полные before/after logs/diffs сохраняются в managed artifacts, не repo scratch. Прежние CI failures остаются видимыми. Controlled delayed-bootstrap reproduction доказывает класс missing-readiness, но не точную причину прежнего CI timing.
2. Детерминированные slow/fault setup regressions, focused tests, typecheck, docs checker и Pi sentinel проходят; coverage не заменяется test inflation.
3. Три последовательных полных local suite исполнения под документированной bounded contention проходят без повторения failed assertions. Пример: process-local affinity к двум разрешённым CPU и test-concurrency=4, если доступно; без глобальных CPU изменений. Это bounded evidence, не обещание математической flake freedom.
4. На exact pushed head required checks/gitleaks проходят, затем один заранее объявленный full CI replay на том же head/fresh runner также проходит. Это проверка стабильности, не repeat-until-green. Любой failure сохраняется и диагностируется в этом seam; real product/security/scope решения эскалируются.
5. Meaningful verified commits, обычный fast-forward push только PR #3; original interaction checkout и donor неизменны. Lifecycle завершает родитель после независимого review.

## Текущий этап
Сначала фиксируется только этот одобренный контракт, до planning/implementation. На этом этапе нет code/probe/model/push и claims об устранении CI failures.
