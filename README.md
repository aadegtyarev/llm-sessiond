# Compact session core

TypeScript-ядро и локальный HTTP/JSON + SSE daemon: маленький транслятор API ↔ Pi RPC.
Daemon управляет локальными соединениями и своими процессами; Pi управляет историей,
очередью исполнения, моделями, инструментами и настройками. Команды и полные ответы
проходят через Core без собственной run/history policy.
[Контракт ядра](docs/contracts/surfaces/session-core.md); Public API: [src/core.ts](src/core.ts).
Внешнему HTTP-клиенту импорт TypeScript не нужен.

## Подготовка и проверки

Нужны Node.js **24.x** (проверено на 24.21.0) и поставляемый с ним npm.
Из корня чистого checkout:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test
```

`npm ci` использует package-lock.json: TypeScript 5.9.3 и @types/node 24.19.2 —
локальные devDependencies, глобальный compiler не нужен. Первая установка требует
доступа к npm registry. Typecheck — `tsc --noEmit`; тесты запускаются встроенным
Node test runner с type stripping, без сборки, моделей и платных SDK.

## Минимальный сценарий

Команда ниже использует **тестовую подделку** `FakePort`, не запускает Pi или модель.
Проверки общего входа: [core-command.test.ts](test/core-command.test.ts).

```sh
node --experimental-strip-types --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { SessionCore } from './src/core.ts';
import { FakePort } from './test/fake-port.ts';

const port = new FakePort();
const core = new SessionCore(port);
core.create('demo');
assert.equal((await core.start('demo')).status, 'running');
const response = await core.command('demo', { type: 'prompt', message: 'hello' });
assert.equal(response.type, 'response');
assert.equal(response.success, true); // Native response, not model-run completion.
assert.equal((await core.stop('demo')).status, 'stopped');
assert.deepEqual(await core.shutdown(), {
  stoppedSessionIds: [], uncertainSessionIds: [], failedSessionIds: [],
});
console.log('fake-port flow: response → stopped → shutdown');
JS
```

## Локальный daemon из checkout

[Запуск и внешний клиент](docs/local-daemon-api.md): Node24 CLI читает приватный
config через stdin до EOF, слушает только `127.0.0.1`; bearer auth обязателен даже
для SSE. Token не передаётся через argv/env/URL. Служба не устанавливается.
[Нормативный API](docs/contracts/surfaces/local-daemon-api.md) описывает routes,
формы событий, readiness, ограничения и честные ошибки потери канала. Сначала SSE ready,
затем create/start; `command` передаёт native `type` и параметры, `compact` — короткий
маршрут к той же команде. `streamingBehavior` выбирает клиент, wrapper default нет.
Native `success:false` остаётся полным HTTP200; ответ команды не доказывает завершение
всего run. UI reply `written` означает только локальную запись, не native consumption.
Для cleanup используйте explicit stop/shutdown; unknown не all-cleaned.

`npm run test:api-smoke` запускает два внешних Node fake-child сценария HTTP/SSE.
Полный fake suite и typecheck проверены на Linux; оба внешних fake smoke прошли на Linux
и в actual Windows CI. Linux/Windows smoke gate и gitleaks прошли в CI.
Реальный Native Pi/provider не запускался; это не full-suite Windows или Native Pi
сертификация.

## Нецели

Нет собственного SDK, history store/registry, run/input coordinator, permissions engine,
UI renderer, sandbox, автоматических retry/restart или private reload bridge.
Сохранённые native files, metadata и locks не читаются и не изменяются daemon.
Локальные сессии не переживают restart; штатной историей и переходами управляет Pi.
Native tools сохраняют права дочернего процесса; display payload может содержать
чувствительные данные и не фильтруется на секреты.

`createPiHarness` из [src/pi-harness.ts](src/pi-harness.ts) использует штатный Pi RPC,
по умолчанию `--mode rpc`, без принудительных session-флагов и скрытых extensions.
Нормативные границы: [контракт Pi adapter](docs/contracts/surfaces/pi-text-harness.md).
Реальные Pi/model/provider проверки требуют отдельного разрешения.
