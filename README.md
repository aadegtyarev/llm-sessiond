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

## Локальный daemon из checkout

HTTP/JSON + SSE implementation: [запуск, routes, auth и limits](docs/local-daemon-api.md).
Новая фича ещё проходит независимую приёмку. Служба не устанавливается.
Создайте закрытый config в owned temp (команда печатает только путь):

```sh
node --input-type=module -e 'import {mkdtempSync,writeFileSync} from "node:fs"; import {tmpdir} from "node:os"; import {join} from "node:path"; import {randomBytes} from "node:crypto"; const p=join(mkdtempSync(join(tmpdir(),"sessiond-")),"config.json"); writeFileSync(p,JSON.stringify({token:randomBytes(32).toString("base64url"),port:3000}),{mode:0o600}); console.log(p);'
# Подставьте напечатанный путь; token не передаётся через argv/env/URL.
node src/daemon-cli.ts < /path/to/config.json
```

В PowerShell stdin: `Get-Content -Raw $config | node src/daemon-cli.ts`;
ограничьте ACL config. В другом терминале клиент читает тот же config, не печатая token:

```sh
node --input-type=module - /path/to/config.json <<'JS'
import {readFileSync} from 'node:fs';
const {token,port}=JSON.parse(readFileSync(process.argv[2],'utf8'));
const headers={Authorization:`Bearer ${token}`};
const response=await fetch(`http://127.0.0.1:${port}/sessions`,{headers});
console.log(response.status,await response.json());
JS
```

Для сессии сначала подключите `/events` с тем же header и дождитесь `event: ready`,
затем create/start/send/reply/stop. Полный воспроизводимый fake protocol/client сценарий:
`npm run test:api-smoke` (без модели и credentials). Остановка daemon — authenticated
`POST /shutdown` с JSON `{}` либо SIGINT/SIGTERM; unknown cleanup не all-cleaned.
После завершения удалите owned config. Loopback не заменяет обязательный bearer auth.

## Нецели

SDK, persistence, истории, восстановления и автоматических retry нет.
Native Pi 1.5 RPC entrypoint —
`createPiHarness` из [src/pi-harness.ts](src/pi-harness.ts), передаваемый в `SessionCore`.
Нормативные границы — [контракт Pi adapter](docs/contracts/surfaces/pi-text-harness.md).
Он сохраняет native tools/resources; handled/queued и недоказанные terminal исходы
оставляют input unknown до явной cleanup. Автоматические тесты используют fake
Node child; bounded реальная генерация проверена, новые вызовы требуют отдельного
consent. Поддержаны tool/question/status observations и явный Core.reply в границах
контракта Pi adapter; written не означает native consumption. UI renderer,
permissions engine и sandbox не предоставляются.
Harness владеет моделью, инструментами и процессом; ядро хранит только текущее
состояние в памяти. Полный перечень ограничений — в нормативном контракте выше.
