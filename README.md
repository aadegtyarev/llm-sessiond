# Compact session core

Компактное TypeScript-ядро и локальный HTTP/JSON + SSE daemon для native Pi сессий:
создание/регистрация, stop с сохранением истории, clean restart, exact reopen с контекстом и delete.
Без trusted storage options ядро по-прежнему работает только в памяти.
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

[Запуск и внешний клиент](docs/local-daemon-api.md): Node24 CLI читает приватный
config через stdin до EOF, слушает только `127.0.0.1`; bearer auth обязателен даже
для SSE. Token не передаётся через argv/env/URL. Служба не устанавливается.
[Нормативный API](docs/contracts/surfaces/local-daemon-api.md) описывает routes,
DTO, readiness, ограничения и честные unknown outcomes. Сначала SSE ready, затем
create/start; HTTP ACK и reply written не означают settlement/native consumption.
`Core.cancel(sessionId, inputId)` и authenticated HTTP cancel позволяют отменить
активный ввод и продолжить разговор после подтверждённой отмены; запрос и пример —
в [руководстве клиента](docs/local-daemon-api.md).
`npm run test:api-smoke` проверяет внешний HTTP/SSE сценарий без модели на Linux
и Windows; это не full Native Pi Windows certification. Для cleanup используйте
explicit stop/shutdown; unknown не all-cleaned.

Для постоянных сессий оператор задаёт в stdin config пару `stateDir`/`nativeSessionDir`.
Native Pi хранит стандартную историю, Core — только registry/binding/current metadata
и used input IDs. Restart daemon сам не запускает Pi; reopen выполняется явно.
[Руководство](docs/local-daemon-api.md) показывает настройку и цикл stop/restart/reopen/delete;
[контракт Core](docs/contracts/surfaces/session-core.md) описывает durability и recovery.
Каталоги должны быть приватными и эксклюзивно owned: после crash нельзя автоматически
перехватывать leftover locks или считать чужой процесс остановленным.

## Нецели

Собственного SDK, conversation history/replay engine и автоматических retry нет.
Registry не копирует prompts/messages/events и не обещает crash-consistent каждый live outcome.
API управления model/effort/reload и manual compaction не предоставляется.
Native Pi 1.5 RPC entrypoint —
`createPiHarness` из [src/pi-harness.ts](src/pi-harness.ts), передаваемый в `SessionCore`.
Нормативные границы — [контракт Pi adapter](docs/contracts/surfaces/pi-text-harness.md).
Он сохраняет native tools/resources; handled/queued и недоказанные terminal исходы
оставляют input unknown до явной cleanup. Автоматические тесты используют fake
Node child; bounded реальная генерация проверена, новые вызовы требуют отдельного
consent. Поддержаны tool/question/status observations и явный Core.reply в границах
контракта Pi adapter; written не означает native consumption. UI renderer,
permissions engine и sandbox не предоставляются.
Harness владеет моделью, инструментами и процессом; Core — lifecycle/admission и optional
durable registry. External fake smoke проверен на Linux/Windows, bounded real Native Pi
stop/restart/exact context recall/delete — на Linux, не как universal provider или Native Windows гарантия. Полный перечень ограничений — в нормативном контракте выше.
