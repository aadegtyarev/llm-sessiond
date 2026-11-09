# Локальный HTTP/SSE API из checkout

Запустите локальный daemon из корня подготовленного checkout с Node.js24.
Внешнему клиенту достаточно HTTP/JSON и SSE; импорт нашего TypeScript не нужен.
Полные routes, DTO, auth, пределы и гарантии: [нормативный API](contracts/surfaces/local-daemon-api.md).
Служба не устанавливается. Для start нужен доступный trusted Native CLI выбранного
модуля: Pi или Claude Code. Listener/list/create не запускают Native CLI; start запускает
его с native startup/resource/hook effects. Примеры native команд ниже описывают форму
запросов, а не результаты реальной interoperation проверки.

## 1. Подготовьте приватный config

Команда создаёт owned temp config и печатает только путь, не token:

```sh
node --input-type=module -e 'import {mkdtempSync,writeFileSync} from "node:fs"; import {tmpdir} from "node:os"; import {join} from "node:path"; import {randomBytes} from "node:crypto"; const p=join(mkdtempSync(join(tmpdir(),"sessiond-")),"config.json"); writeFileSync(p,JSON.stringify({token:randomBytes(32).toString("base64url"),port:3000}),{mode:0o600}); console.log(p);'
```

Ограничьте Windows ACL файла и его каталога текущим оператором; Unix mode не заменяет
Windows ACL. Не передавайте token через argv/env/URL и не включайте config в repo.
Launch settings при необходимости задаёт оператор, не HTTP-клиент; это не sandbox.
Config поддерживает optional `launch` и `harnesses`: module ID → trusted launch object
из executable/prefixArgs/cwd/stopDeadlineMs. Root launch — прежний Pi config;
отсутствие/null означает `{}`. `harnesses.pi` заменяет его целиком, не merge.
Claude использует только `harnesses['claude-code']` либо свои defaults, без Pi cwd/args.
Default executables — `pi`/`claude`, stop deadline — 5000ms; transport flags добавляет adapter.
Неизвестные module IDs в daemon config отклоняются до factory/bind/spawn. Не задавайте
model/permissions/history defaults в этих четырёх launch fields: ими владеет Native CLI.
[Строгая схема и ограничения](contracts/surfaces/local-daemon-api.md#конфигурация-и-readiness).

## 2. Запустите listener

Подставьте напечатанный путь; stdin должен получить JSON и EOF:

```sh
node src/daemon-cli.ts < /path/to/config.json
```

В PowerShell: `Get-Content -Raw $config | node src/daemon-cli.ts`.
Дождитесь stdout JSON `listening.host/port`. Это только bind, не подписка или native readiness.
Pi start ждёт successful get_state, Claude — native initialize success, не model warmup.
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

Это default Pi путь. Для Claude выберите модуль явно при create; тот же daemon может
одновременно держать обе независимые сессии:

```sh
node src/api-cli.ts --harness claude-code --config /path/to/config.json create claude-demo
node src/api-cli.ts --config /path/to/config.json start claude-demo
```

`--harness ID` разрешён один раз, только до create, в любом порядке с config/port.
После create модуль закреплён на весь lifecycle, get/list/session events показывают
optional `harness`. Без selector прежние views содержат только sessionId/status.
Unknown ID даёт409 harness-rejected без записи/события/spawn; это не путь импорта.

Pi startup question может прийти до завершения start. Для reply используйте исходные
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
launch settings клиент не исполняет. Явный start вызывает API; запуск выбранного Native
CLI выполняет daemon, не клиент. Клиент валидирует shape config map, не знает registry
names сервера. Native permissions у Claude передаются полными records; см. ниже.

stdout — полный API JSON без CLI envelope; exit0 означает HTTP200, включая
Pi success:false, Claude native control error/local written, reply unknown и uncertain
shutdown. API/transport failure — exit1,
CLI args/config/JSON failure — exit2. ACK не completion, written не consumption.
Нет retry/reconnect/hidden stop; завершение events не останавливает серверную работу.
После explicit stop/shutdown чистый SSE EOF даёт exit0, socket loss/обрезанный frame — exit1;
уже напечатанный prefix остаётся, replay нет. [Полная грамматика и ограничения](contracts/surfaces/api-cli-client.md).

[CLI subprocess smoke](../test/api-cli-smoke.mjs) и
[mixed Pi/Claude smoke](../test/module-external-smoke.mjs) входят в `npm run test:api-smoke`:
CLI → настоящий daemon-cli → Node fake children. Это воспроизводимые fake сценарии,
не проверка установленного Native CLI/provider.

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
На Pi question отправляйте явный reply с точными requestId/method. Ответ команды не доказывает
завершение model run, reply written не native consumption. Не повторяйте команды
автоматически после разрыва; при необходимости явно остановите локальную сессию.

Для Pi сообщения используйте authenticated POST `/sessions/:sessionId/command`:

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

Для Claude используйте native `user` JSON через тот же `/command` или CLI command:
`node src/api-cli.ts --config /path/to/config.json command claude-demo < user.json`.
[Native user body и control response](contracts/surfaces/claude-code-harness.md#команды-и-результаты)
приведены в контракте adapter. CLI проверяет JSON, но отправляет исходную stdin строку,
не пересериализует её. Для one-way user ответ — только `{kind:'written'}` после local
callback + drain, не native ACK/acceptance/completion. Correlated control_request
возвращает полный control_response по nested response.request_id, включая native error
с HTTP200/exit0. Result приходит асинхронно в SSE core как
`{type:'native-record',sessionId,record}`; user→result FIFO не существует. Внешний sessionId —
local route, не native record.session_id. Это не raw-all-native/private stream.

Полный воспроизводимый client→CLI→Node fake-child сценарий без Pi и модели:
`npm run test:api-smoke`. [JS client](../test/api-client.mjs) не импортирует Core/TS;
[сценарий](../test/api-external-smoke.mjs) проверяет независимые соединения,
полные ответы, события, явные UI replies и конкурентные compact/abort.

## Сожмите контекст Pi

POST `/sessions/:sessionId/compact` принимает строго `{}` либо:

```json
{"customInstructions":"Сохрани решения и открытые задачи"}
```

Это короткий маршрут к `/command` с `type:"compact"`. Дополнительные поля и нестроковые
инструкции дают HTTP400. Полный native результат сохраняет `summary`, `firstKeptEntryId`,
`tokensBefore` и любые optional metadata. Unsupported compact адаптера — HTTP409
`harness-rejected`; физическая потеря ожидаемого ответа — HTTP409 `harness-unknown`.
Нормальное ожидание не становится ошибкой и не запускает abort/restart/retry.

На Claude Pi compact shortcut отклоняется с409 harness-rejected без native write:
собственной summary/readback эмуляции нет.

Pi запросы могут ждать одновременно; ответы коррелируются по `id`, не по порядку прибытия.
Долгий compact не блокирует запись `abort` или UI reply. Pi сам решает busy/queued/handled,
приём и отказ. Native Pi 1.5 compact начинает с `await abort()` и не продолжает
прерванный run; daemon не обещает противоположного.

## Локальная сессия и native история

`POST /sessions {sessionId,harness?}` создаёт запись только в памяти; `start {}` запускает
свой Native CLI. Harness — непустая строка; wrong shape/extra fields дают400.
`get/list` показывают local sessionId/status и optional explicit harness, не историю,
model-run status или актуальный idle process-liveness. Несколько локальных сессий
имеют независимые процессы и каналы. Stop не даёт права повторно запустить ту же
локальную запись; после restart daemon список пуст.

Выбранный Native CLI владеет history/persistence и переходами. Daemon не хранит
native history registry,
не выделяет/импортирует/удаляет native files, не разбирает headers и не восстанавливает
settings из истории. Старые saved files, metadata и locks остаются нетронутыми:
автоматической миграции или уборки нет. `stateDir/nativeSessionDir` больше не config;
старый config с этими полями отклоняется без эффектов. Для штатных Pi history-команд
используйте общий `/command`, без wrapper target-file guards или settings mirror.

## Ответьте на вопрос Pi

POST `/sessions/:sessionId/reply` использует исходный `requestId` и `method`:

```json
{"requestId":"question-id","method":"confirm","confirmed":true}
```

Для select/input передайте `value:string`; для отмены любого вопроса — `cancelled:true`
вместо ответа. Extra fields отклоняются. `{"kind":"written"}` означает только local
callback + drain stdin, не Native ACK, receipt или consumption. Pi определяет expiry,
options и дальнейшее исполнение. Wrapper проверяет форму и маршрут вопроса; он не
строит permission/idle/consumption engine и не отправляет скрытых ответов.

Для Claude читайте полный native control_request в SSE native-record и отправляйте
явный native control_response через command с исходным request_id. Complex input,
permission suggestions и tool IDs не сводятся к confirm:boolean. Никаких autoanswers.
Прежний `/reply` на Claude вернёт rejected; command допустим только в running, полной
startup UI/permission parity нет. [Форма native ответа](contracts/surfaces/claude-code-harness.md#события-и-явные-permission-answers).

## 4. Завершите работу

Вызовите authenticated POST `/sessions/:sessionId/stop` с JSON `{}` для отдельной
сессии; затем POST `/shutdown` с `{}` либо SIGINT/SIGTERM для daemon cleanup.
Читайте сводку: unknown не all-cleaned и не гарантирует выход процесса.
Для запущенного child stop подтверждается только observed own exit/close или retained
exit fact, не kill return/EOF/timeout; created останавливается локально, без запуска.
Неизвестный исход сохраняет cleanup responsibility. Descendant,
remote или all-background завершение не обещано. После завершения удалите owned config.
Разрыв SSE сам по себе сессию не останавливает; replay нет. Display и полные native
payload не secret-filtered, Native tools сохраняют права child. Действуют прежние
лимиты: body 64KiB, headers 8KiB; максимум 32 SSE streams, на stream 256 ожидающих frames
и 1MiB с writable buffer. Oversize/overflow закрывает stream без truncate, полнота
после разрыва не восстанавливается. [Transport и cleanup](contracts/surfaces/local-daemon-api.md).

Полный fake suite и typecheck проверены на Linux. Все четыре внешних Node fake smoke
прошли на Linux и в Windows CI; обязательный smoke gate/gitleaks и независимый source
review пройдены. Это не real Native CLI/provider/auth/model/context проверка,
full-suite Windows или Native Windows certification. Нет universal recall/persistence/
tools/background гарантий. Codex и dynamic plugin loading не реализованы;
service/release installation и rollout не входят в этот flow.
