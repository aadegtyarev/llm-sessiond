# Compact session core

Компактное TypeScript-ядро сессий в памяти. Нормативные гарантии, ошибки и границы:
[контракт ядра](docs/contracts/surfaces/session-core.md). Public API: [src/core.ts](src/core.ts).

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

Команда ниже выполняется из корня checkout после подготовки. `FakePort` —
**тестовая подделка**, не native adapter: ACK не завершает ввод, завершение
имитируется отдельным событием. Проверяемый тест того же потока:
[test/core-flow.test.ts](test/core-flow.test.ts).

```sh
node --experimental-strip-types --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { SessionCore } from './src/core.ts';
import { FakePort } from './test/fake-port.ts';

const port = new FakePort();
const core = new SessionCore(port);
core.create('demo');
assert.equal((await core.start('demo')).status, 'running');
assert.equal((await core.send('demo', 'input-1', 'hello')).status, 'pending');
port.emit('demo', { type: 'input-completed', inputId: 'input-1' });
assert.equal(core.get('demo').input?.status, 'completed');
assert.equal((await core.stop('demo')).status, 'stopped');
assert.deepEqual(await core.shutdown(), {
  stoppedSessionIds: [], uncertainSessionIds: [], failedSessionIds: [],
});
console.log('fake-port flow: completed → stopped → shutdown');
JS
```

## Нецели

Это не готовый daemon/CLI. HTTP/SDK, persistence, истории, восстановления и
автоматических retry здесь нет. Native Pi 1.5 RPC entrypoint —
`createPiHarness` из [src/pi-harness.ts](src/pi-harness.ts), передаваемый в `SessionCore`.
Нормативные границы — [контракт Pi adapter](docs/contracts/surfaces/pi-text-harness.md).
Он сохраняет native tools/resources; handled/queued и недоказанные terminal исходы
оставляют input unknown до явной cleanup. Реальная генерация не проверена;
тесты используют только fake Node child. UI/permissions и sandbox не гарантированы.
Harness владеет моделью, инструментами и процессом; ядро хранит только текущее
состояние в памяти. Полный перечень ограничений — в нормативном контракте выше.
