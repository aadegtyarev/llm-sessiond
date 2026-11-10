# Упрощение transport validation и shutdown state

Статус: **COMPLETE**. Оператор «Работай по замечаниям» одобрил обе optional рекомендации Sol6.1.

## Цель и поведение

Один законченный behavior-preserving refactor: общие чистые command/compact shape validators в существующем `daemon-schema` и только сохранённый `shutdownTask` как признак закрытого admission Core/daemon вместо `closed`/`closing`.
Новых возможностей и исправлений заявленных functional defects нет; новые invariant-тесты могут проходить на baseline.

## Затронутые поверхности

- [Session Core](../surfaces/session-core.md).
- [Local daemon API](../surfaces/local-daemon-api.md).
- [API CLI client](../surfaces/api-cli-client.md).
- Native guardrails: [Pi](../surfaces/pi-text-harness.md), [Claude Code](../surfaces/claude-code-harness.md).
- Текущее использование: [API guide](../../local-daemon-api.md), [README](../../../README.md).

## Сценарии и интерфейсные ограничения

- Command — JSON object с непустым string `type`, включая whitespace как прежде; неизвестные поля и все native параметры сохраняются. Нет trim, нормализации, defaults или allowlist.
- Compact — только `{}` либо `{customInstructions:string}`, включая пустую строку; лишние поля и неверные типы отвергаются. Ноль bytes stdin CLI по-прежнему означает `{}`.
- CLI проверяет форму, но отправляет ORIGINAL JSON payload, не результат пересериализации: сохраняются `1e20`, форматирование и прежняя граница 65536 bytes.
- CLI bad shape даёт exit2 до HTTP; HTTP bad shape даёт400 до Core/port effects. Парсер, лимиты и существующие ошибки не меняются.
- Вызов Core.shutdown немедленно закрывает create/get/list/subscribe/start/command/reply/stop до первого ожидания; повторный вызов возвращает ТОТ ЖЕ сохранённый Promise.
- Core cleanup остаётся единственным, отложенным на microtask; синхронный reentry не запускает новый обход/port.stop. Уже начатые операции и сводка сохраняют прежнюю семантику.
- Daemon сохраняет ОБЕ admission-проверки, до и после requestBody. Запрос, body которого завершён после начала shutdown, получает503 closed без create/command effects.
- Пересечение public close() и HTTP /shutdown не повторяет port.stop. Идентичность Promise публичного async close() не становится новой гарантией.
- Native semantics, публичные types/API, errors, auth, SSE, security и lifecycle не меняются; Core не получает native shape/domain policy.

## Нецели

- Никаких иных cleanup/rewrite/архитектуры, новых файлов runtime/абстракций/controllers, возможностей или микроконтрактов.
- Не менять Native wire/process/events/harness-session/types/registry/composition/config и runtime API client; Pi/Claude transport, permissions, defaults, model/history policy остаются прежними.
- Нет SDK/deps/package/lock/CI/protection изменений, установок/npm ci, dynamic plugins или Codex.
- Native budget 162/162 израсходован: 0 новых probes. Не обращаться к running service, private config/history/auth/env/SSH, release/install paths; не выполнять deployment/restart.
- Installed v0.3.0, PID412248, 127.0.0.1:3001, старые releases/artifacts и `node_modules` (66307:116392234) не трогать.

## Приёмка и валидация

- Обе независимые границы завершены в ОДНОЙ feature/PR; фактический diff не расширяет scope и сохраняет все сценарии выше.
- Общая parity-матрица valid/invalid command/compact: missing/empty/non-string type, whitespace type, unknown native fields, empty instructions, wrong types и extra compact fields.
- Проверить CLI raw JSON (`1e20`, byte boundary) и exit2/no HTTP; HTTP400/no Core/port effects.
- Проверить immediate admission всех восьми операций Core, same Promise, single deferred cleanup и reentry.
- Проверить daemon body race (create/command), обе admission-проверки и concurrent public close/HTTP shutdown с одним port.stop.
- Focused fake tests → `npm run typecheck` → полный `npm test` → `npm run test:api-smoke` (все четыре external Node fake smoke).
- Fresh независимый read-only review всей фичи; существующие required Linux+Windows smoke CI, gitleaks и protection остаются неизменными и обязательными. Не заявлять real Native или full-suite Windows проверки.

## Выполнение и lifecycle

- База: freshly fetched `origin/main` = `741471e67a6b9e789efd55676afed0d2bcfa7b58`; новая ветка `refactor/validation-shutdown-state`. Историческая `feat/claude-code-harness` сохраняется.
- MULTI-SEAM: A — api-cli/daemon-routes/daemon-schema и focused tests; B — core/daemon и отдельные focused tests. Это внутренние шаги одной полной поставки, не отдельные deliveries.
- Только SERIAL exclusive same-checkout writers: recorder (контракт/ветка/evidence), затем A, затем B, затем отдельно возобновлённый integration-only owner после чистых закоммиченных A/B.
- Каждый handoff — meaningful verified commit и чистые index/worktree; отчёты/логи вне repo. Независимый review — после integration, не параллельно writer.
- После общей валидации отметить COMPLETE; parent коммитит и проверяет durable surface updates, затем удаляет временный feature contract без архивных ссылок по [метаконтракту](../meta-contract.md).
- Parent владеет push/PR/required CI/protected merge после green review; дети не публикуют и не merge. Release/install/restart не входят в поставку.

## Завершение и reconciliation

- Код `f7b335260bd1ebd90a1575d8b33c1f5d4e70e022` проверен: typecheck PASS, полный fake suite 569/569, четыре Linux external Node fake smoke PASS; независимый review — ACCEPT, no issues.
- По проверке parent required code CI `42782707466` на этом кодовом HEAD — SUCCESS: Ubuntu/Windows smoke, gitleaks и both-platform guard. CI окончательного lifecycle HEAD остаётся обязательным перед merge.
- Committed durable contracts session-core, local-daemon-api и api-cli-client, guardrails pi-text-harness и claude-code-harness, а также API guide и README из раздела «Затронутые поверхности» побитово совпадают с BASE и остаются корректными: поведение не изменилось, искусственных durable-doc правок нет.
- Перед удалением этого временного контракта проверить его сохранённый COMPLETE commit, committed/disk равенство всех семи durable документов BASE и неизменность остальных путей относительно принятого кодового HEAD.
- Только source refactor и fake validation: Native probes 0; release/install/deployment/service restart не выполнялись. Protected merge и проверки окончательного HEAD принадлежат parent.
