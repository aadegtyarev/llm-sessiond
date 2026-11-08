# Локальный HTTP/SSE API из checkout

Запустите локальный daemon из корня подготовленного checkout с Node.js24.
Внешнему клиенту достаточно HTTP/JSON и SSE; импорт нашего TypeScript не нужен.
Полные routes, DTO, auth, пределы и гарантии: [нормативный API](contracts/surfaces/local-daemon-api.md).
Служба не устанавливается. Для native сессии нужен доступный trusted Native Pi;
запуск listener и запрос list сами по себе не запускают модель.

## 1. Подготовьте приватный config

Команда создаёт owned temp config и печатает только путь, не token:

```sh
node --input-type=module -e 'import {mkdtempSync,writeFileSync} from "node:fs"; import {tmpdir} from "node:os"; import {join} from "node:path"; import {randomBytes} from "node:crypto"; const p=join(mkdtempSync(join(tmpdir(),"sessiond-")),"config.json"); writeFileSync(p,JSON.stringify({token:randomBytes(32).toString("base64url"),port:3000}),{mode:0o600}); console.log(p);'
```

Ограничьте Windows ACL файла и его каталога текущим оператором; Unix mode не заменяет
Windows ACL. Не передавайте token через argv/env/URL и не включайте config в repo.
Launch settings при необходимости задаёт оператор, не HTTP-клиент; это не sandbox.

## 2. Запустите listener

Подставьте напечатанный путь; stdin должен получить JSON и EOF:

```sh
node src/daemon-cli.ts < /path/to/config.json
```

В PowerShell: `Get-Content -Raw $config | node src/daemon-cli.ts`.
Дождитесь stdout JSON `listening.host/port`. Это только bind, не подписка или readiness Pi.
Если выбрали `port:0`, используйте фактический port из listening в клиенте.

## Командный клиент из checkout

[CLI](contracts/surfaces/api-cli-client.md) — готовый reference HTTP/JSON+SSE потребитель,
не интерактивный чат. Для работающего listener и того же приватного config:

```sh
node src/api-cli.ts --config /path/to/config.json list
node src/api-cli.ts --config /path/to/config.json events
```

Вторая команда остаётся подключённой и пишет NDJSON `{event,data}`. Дождитесь ready,
затем в другом процессе явно создайте и запустите сессию:

```sh
node src/api-cli.ts --config /path/to/config.json create demo
node src/api-cli.ts --config /path/to/config.json start demo
```

Startup question может прийти до завершения start. Для reply используйте исходные
requestId/method из question; автоматического ответа нет. Payload берётся из UTF8 JSON
файла до EOF, например в POSIX shell:

```sh
node src/api-cli.ts --config /path/to/config.json command demo < request.json
node src/api-cli.ts --config /path/to/config.json compact demo < compact.json
node src/api-cli.ts --config /path/to/config.json reply demo < reply.json
```

В PowerShell передайте JSON через `Get-Content -Raw request.json | node src/api-cli.ts --config /path/to/config.json command demo`.
Формы command/compact/reply описаны ниже. Command/reply требуют JSON object; compact
принимает ноль bytes как `{}`, либо `{}`/`{customInstructions:string}`. Whitespace-only
stdin не заменяет `{}` и даёт exit2. Другие операции stdin не читают.

Все флаги идут перед операцией; config port0 требует `--port ACTUAL_PORT`. Optional npm
вызов: `npm run --silent client -- --config /path/to/config.json list`. Без `--silent`
возможный banner npm не является stdout CLI. Token не передавайте через argv/env/URL;
launch settings клиент не исполняет. Явный start вызывает API; запуск Pi выполняет daemon, а не клиент.

stdout — полный API JSON без CLI envelope; exit0 означает HTTP200, включая Native
success:false/reply unknown/uncertain shutdown. API/transport failure — exit1,
CLI args/config/JSON failure — exit2. ACK не completion, written не consumption.
Нет retry/reconnect/hidden stop; завершение events не останавливает серверную работу.
После explicit stop/shutdown чистый SSE EOF даёт exit0, socket loss/обрезанный frame — exit1;
уже напечатанный prefix остаётся, replay нет. [Полная грамматика и ограничения](contracts/surfaces/api-cli-client.md).

Новый [CLI subprocess smoke](../test/api-cli-smoke.mjs) входит в `npm run test:api-smoke`
третьим сценарием: CLI → настоящий daemon-cli → Node fake child. Локальная CLI валидация —
Linux fake tests; actual Windows CI/review этого клиента ещё предстоят. Прежняя Native API
проверка не является real CLI проверкой; новых Pi/model/provider запусков для клиента нет.

## 3. Подключите внешний клиент

В другом терминале прочитайте тот же приватный config. Пример для заданного port3000
только запрашивает current list, не запускает модель и не печатает token:

```sh
node --input-type=module - /path/to/config.json <<'JS'
import {readFileSync} from 'node:fs';
const {token,port}=JSON.parse(readFileSync(process.argv[2],'utf8'));
const headers={Authorization:`Bearer ${token}`};
const response=await fetch(`http://127.0.0.1:${port}/sessions`,{headers});
console.log(response.status,await response.json());
JS
```

Для работы с сессией подключите `/events` с тем же Authorization header и дождитесь
`event: ready`. Только затем create/start/command; обрабатывайте события уже во время start.
На question отправляйте явный reply с точными requestId/method. Ответ команды не доказывает
завершение model run, reply written не native consumption. Не повторяйте команды
автоматически после разрыва; при необходимости явно остановите локальную сессию.

Для сообщения используйте authenticated POST `/sessions/:sessionId/command`:

```json
{"type":"prompt","message":"Привет","streamingBehavior":"followUp"}
```

Тело — native объект, без wrapper envelope. `streamingBehavior` выбирает клиент;
если поле отсутствует, daemon его не добавляет. Адаптер генерирует собственный RPC `id`.
Ответ Pi возвращается целиком: `id/type/command/success/data` либо `error`, включая
все optional поля. Native отказ (`success:false`) — HTTP200, не API error.
Настройки, `abort`, переходы сессий и другие команды идут через тот же `/command`;
их возможности и семантика принадлежат Pi, не wrapper. Списка разрешённых типов нет.
Нет автоматических readback/proof запросов после команд.

Полный воспроизводимый client→CLI→Node fake-child сценарий без Pi и модели:
`npm run test:api-smoke`. [JS client](../test/api-client.mjs) не импортирует Core/TS;
[сценарий](../test/api-external-smoke.mjs) проверяет независимые соединения,
полные ответы, события, явные UI replies и конкурентные compact/abort.

## Сожмите контекст

POST `/sessions/:sessionId/compact` принимает строго `{}` либо:

```json
{"customInstructions":"Сохрани решения и открытые задачи"}
```

Это короткий маршрут к `/command` с `type:"compact"`. Дополнительные поля и нестроковые
инструкции дают HTTP400. Полный native результат сохраняет `summary`, `firstKeptEntryId`,
`tokensBefore` и любые optional metadata. Unsupported compact адаптера — HTTP409
`harness-rejected`; физическая потеря ожидаемого ответа — HTTP409 `harness-unknown`.
Нормальное ожидание не становится ошибкой и не запускает abort/restart/retry.

Запросы могут ждать одновременно; ответы коррелируются по `id`, не по порядку прибытия.
Долгий compact не блокирует запись `abort` или UI reply. Pi сам решает busy/queued/handled,
приём и отказ. Native Pi 1.5 compact начинает с `await abort()` и не продолжает
прерванный run; daemon не обещает противоположного.

## Локальная сессия и история Pi

`POST /sessions {sessionId}` создаёт запись только в памяти; `start {}` запускает свой Pi.
`get/list` показывают локальные `sessionId/status`, не историю и не model-run status.
Несколько локальных сессий имеют независимые процессы и RPC channels. Stop не даёт права
повторно запустить ту же локальную запись; после restart daemon список пуст.

Pi владеет native history/persistence и переходами. Daemon не хранит registry,
не выделяет/импортирует/удаляет native files, не разбирает headers и не восстанавливает
settings из истории. Старые saved files, metadata и locks остаются нетронутыми:
автоматической миграции или уборки нет. `stateDir/nativeSessionDir` больше не config;
старый config с этими полями отклоняется без эффектов. Для штатных Pi history-команд
используйте общий `/command`, без wrapper target-file guards или settings mirror.

## Ответьте на вопрос

POST `/sessions/:sessionId/reply` использует исходный `requestId` и `method`:

```json
{"requestId":"question-id","method":"confirm","confirmed":true}
```

Для select/input передайте `value:string`; для отмены любого вопроса — `cancelled:true`
вместо ответа. Extra fields отклоняются. `{"kind":"written"}` означает только local
callback + drain stdin, не Native ACK, receipt или consumption. Pi определяет expiry,
options и дальнейшее исполнение. Wrapper проверяет форму и маршрут вопроса; он не
строит permission/idle/consumption engine и не отправляет скрытых ответов.

## 4. Завершите работу

Вызовите authenticated POST `/sessions/:sessionId/stop` с JSON `{}` для отдельной
сессии; затем POST `/shutdown` с `{}` либо SIGINT/SIGTERM для daemon cleanup.
Читайте сводку: unknown не all-cleaned и не гарантирует выход процесса.
После завершения удалите owned config. Разрыв SSE сам по себе сессию не останавливает;
replay нет. Display text не secret-filtered, Native tools сохраняют права child.
Полный fake Node suite и typecheck проверены на Linux. Оба внешних fake smoke прошли
на Linux и в actual Windows CI; обязательный smoke gate и gitleaks прошли в CI.
Это не full-suite Windows certification; реальный Native Pi/provider не запускался.
Границы cleanup определяет [нормативный API](contracts/surfaces/local-daemon-api.md).
