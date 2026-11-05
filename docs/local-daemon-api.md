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
`event: ready`. Только затем create/start/send; обрабатывайте события уже во время start.
На question отправляйте явный reply с точными requestId/method. HTTP ACK не settlement,
reply written не native consumption. Не повторяйте команды автоматически после разрыва;
проверьте текущее состояние и при необходимости явно остановите сессию.

Для отмены конкретного активного ввода отправьте authenticated POST
`/sessions/:sessionId/cancel` с JSON `{inputId}`. Результат — `InputView` этого ввода;
только статус `cancelled` в HTTP/SSE доказывает отменённое завершение, не сам запрос
или ACK. Пока control command в полёте, следующий send также заблокирован, даже
если ввод естественно завершился. Неверный/неактивный ID, неподтверждённый send или
повторный cancel отклоняются. При `unknown` новый send запрещён: нужен explicit stop.
После доказанного `cancelled` и завершения cancel-запроса можно отправить новый input
в ту же сессию без перезапуска Pi и потери контекста. Tool effects не откатываются.

Полный воспроизводимый внешний client→CLI→fakeNative сценарий без модели:
`npm run test:api-smoke`. Его [JS client](../test/api-client.mjs) не импортирует Core/TS;
[сценарий](../test/api-external-smoke.mjs) показывает ready, операции, явные ответы
и targeted cancel → продолжение разговора.

## 4. Завершите работу

Вызовите authenticated POST `/sessions/:sessionId/stop` с JSON `{}` для отдельной
сессии; затем POST `/shutdown` с `{}` либо SIGINT/SIGTERM для daemon cleanup.
Читайте сводку: unknown не all-cleaned и не гарантирует выход процесса.
После завершения удалите owned config. Разрыв SSE сам по себе сессию не останавливает;
replay нет. Display text не secret-filtered, Native tools сохраняют права child.
Проверенный Windows сценарий — API fake smoke, не full Native Pi certification;
границы платформ и cleanup определяет [нормативный API](contracts/surfaces/local-daemon-api.md).
