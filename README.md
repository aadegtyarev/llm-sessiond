# Compact session core

Нейтральное TypeScript-ядро и локальный HTTP/JSON + SSE daemon с подключаемыми
harness-модулями Pi и Claude Code. Daemon управляет локальными соединениями и своими
процессами; выбранный Native CLI — историей, очередью, моделями, tools, permissions
и настройками. Native команды/ответы проходят без собственной run/history policy.
[Контракт ядра](docs/contracts/surfaces/session-core.md); Public API: [src/core.ts](src/core.ts).
Внешнему HTTP-клиенту импорт TypeScript не нужен; в checkout есть [командный CLI-клиент](docs/contracts/surfaces/api-cli-client.md).

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

Команда ниже использует **тестовую подделку** `FakePort`, не запускает Native CLI или модель.
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
затем create/start. `create` без selector сохраняет Pi default; explicit `harness`
выбирает `pi`/`claude-code`. Listener/list/create не запускают Native CLI; start запускает
его с собственными native ресурсами и hook effects.

`command` передаёт native `type` и параметры. [Pi](docs/contracts/surfaces/pi-text-harness.md)
возвращает полный RPC response, включая `success:false` с HTTP200.
[Claude Code](docs/contracts/surfaces/claude-code-harness.md) возвращает полный correlated
control_response либо только local `{kind:'written'}` для one-way user/permission answer;
полный result приходит асинхронно в SSE native-record. ACK/written не run completion.
Pi compact shortcut на Claude отклоняется. Для cleanup используйте explicit stop/shutdown;
unknown не all-cleaned.

`npm run test:api-smoke` запускает четыре external Node fake сценария, включая mixed
Pi/Claude CLI → daemon. Полный fake suite и typecheck проверены на Linux; четыре smoke
прошли на Linux и в Windows CI с обязательным smoke gate/gitleaks, source review пройден.
Это не реальная Native CLI/provider/auth/model/context интеграция, full-suite Windows
или Native Windows сертификация.

## Командный клиент

Для уже запущенного daemon используйте тот же приватный config:

```sh
node src/api-cli.ts --config /path/to/config.json list
node src/api-cli.ts --config /path/to/config.json --harness claude-code create demo
npm run --silent client -- --config /path/to/config.json list
```

При config port0 добавьте `--port ACTUAL_PORT` перед операцией. Это только HTTP-клиент,
не запуск daemon/Native CLI и не чат. `--harness` — только prefix flag для create.
stdout — полный API JSON, events — NDJSON; exit0 включает native errors/local written
и не означает run completion. Command/reply читают JSON stdin до EOF;
compact принимает ноль bytes или строгий JSON инструкций. [Грамматика, exit/EOF и ограничения](docs/contracts/surfaces/api-cli-client.md);
[сценарий внешнего клиента](docs/local-daemon-api.md#командный-клиент-из-checkout).

## Нецели

Trusted composition регистрирует модули вне Core; HTTP ID не импортирует код.
Codex не реализован, dynamic plugin loading и SDK framework отсутствуют.
Нет собственного SDK, native history store/registry, run/input coordinator, permissions engine,
UI renderer, sandbox, автоматических retry/restart или private reload bridge.
Сохранённые native files, metadata и locks не читаются и не изменяются daemon.
Локальные сессии не переживают restart; историей и переходами управляет выбранный Native CLI.
Native tools сохраняют права дочернего процесса; display и полные native payload могут
содержать чувствительные данные и не фильтруются на секреты.

`createPiHarness` из [src/pi-harness.ts](src/pi-harness.ts) использует штатный Pi RPC,
по умолчанию `--mode rpc`, без принудительных session-флагов и скрытых extensions.
Нормативные границы: [контракт Pi adapter](docs/contracts/surfaces/pi-text-harness.md).
Реальные Native CLI/model/provider проверки требуют отдельного разрешения.
