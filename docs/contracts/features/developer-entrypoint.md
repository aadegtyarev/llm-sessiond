# Воспроизводимый developer entrypoint

Статус: одобрен, активен; 2026-07-10. Финализация после parent acceptance.

## Цель и наблюдаемое поведение

Чистый checkout на Node.js 24.x имеет объявленный и зафиксированный dev-toolchain.
Один короткий README описывает подготовку, две проверки и реальный минимальный сценарий.

## Сценарии и границы ошибок

- Разработчик выполняет npm ci с отключёнными install scripts, затем typecheck и tests.
- README ведёт к исполнимому примеру с явно поддельным портом без модели и native adapter.
- При недоступной сети/окружении проверка останавливается с точной ошибкой, без обходов.

## Нецели

Изменения runtime, API, архитектуры, publisher, tsconfig, тестов и гарантий ядра;
HTTP/SDK/adapters/persistence, CI/CD, модели, новые инструменты и build pipeline.

## Затронутая поверхность

Нормативное [ядро сессий](../surfaces/session-core.md) остаётся без изменений.
Новый developer surface не создаётся; lifecycle и durable surface финализирует родитель.

## Интерфейсы и ограничения

Точные devDependencies: TypeScript 5.9.3 и @types/node 24.19.2; без runtime dependencies.
Обычный npm-generated package-lock.json, Node 24.x, существующие npm scripts.
Scope: package.json, package-lock.json, README.md, точечные dev-команды AGENTS.md,
этот контракт. Авторские файлы не длиннее 100 строк.
Генерация lock и install/ci разрешены только вне repo, в собственной временной копии
с отдельным npm cache, scripts/audit/fund отключены; donor node_modules не изменять.

## Критерии приёмки

- Чистая временная копия устанавливается из lock через npm ci и использует свои compiler/types.
- Typecheck успешен, все 118 тестов проходят, README-сценарий реально выполнен.
- README содержит prerequisites, подготовку, проверки, ссылку на surface и честные нецели.
- Полный лог фиксирует HEAD, cwd, версии, команды и exit results; копия сохранена для review.
- Нет изменений src/, test/, runtime, tsconfig и donor; index/worktree чисты после коммитов.

## Проверки

В отдельной копии: npm ci --ignore-scripts --no-audit --no-fund,
npm run typecheck, npm test, выполнение README-примера.
Затем docs checker, git diff --check, сравнение runtime с e377c7810abbca1868be17116cb040d8352a8651
и проверка donor device:inode 66307:116392234. Сохранить полный committed diff и лог вне repo.
Контракт остаётся активным до независимого review и parent acceptance.
