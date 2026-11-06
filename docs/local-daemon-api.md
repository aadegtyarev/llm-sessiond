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
Наблюдаемый `cancelled` публикуется после завершения control fence: уже из его
subscriber можно отправить новый input в ту же сессию без перезапуска Pi и потери
контекста, не ожидая отдельного HTTP ACK. Tool effects не откатываются.

Полный воспроизводимый внешний client→CLI→fakeNative сценарий без модели:
`npm run test:api-smoke`. Его [JS client](../test/api-client.mjs) не импортирует Core/TS;
[сценарий](../test/api-external-smoke.mjs) показывает ready, операции, явные ответы
и targeted cancel → продолжение разговора.

## Сохраните и повторно откройте native-сессию

Полные routes и гарантии — в [API contract](contracts/surfaces/local-daemon-api.md),
порядок записи/recovery — в [контракте Core](contracts/surfaces/session-core.md).
Без storage settings остаётся in-memory режим с `--no-session`.

1. Добавьте в приватный stdin config парные непустые `stateDir` и `nativeSessionDir`.
   Первый каталог хранит metadata, второй — непосредственные native `.jsonl` files.
   Ограничьте права обоих каталогов/Windows ACL. Для новых сессий cwd — `launch.cwd`
   либо cwd daemon; импорт сохраняет cwd native header. Это trusted operator paths,
   не поля HTTP request.
2. Подключите authenticated SSE и дождитесь ready. `POST /sessions {sessionId}`
   резервирует NEW empty file; затем `POST /sessions/:sessionId/start {}` запускает Pi.
   Header пишет Pi, allocation filename не является native UUID. Native resources
   могут действовать уже при startup; sandbox не предоставляется.
3. Отправьте `send` с новым inputId и дождитесь input completed в SSE/current state.
   HTTP ACK не settlement; pending/unknown текущего поколения блокируют следующий send.
4. Выполните `POST /sessions/:sessionId/stop {}`, затем `POST /shutdown {}`. История
   сохраняется. Проверьте clean результат: unknown не all-cleaned. Never-launched empty
   records тоже сохраняются и могут быть остановлены локально без Pi.
5. Запустите новый daemon с теми же roots. Registry восстанавливается без auto-launch;
   снова подключите SSE до `start`. Откройте прежний sessionId через `start {}` и отправьте
   новый inputId. Контекст берётся из того же native file/UUID: не пересылайте прошлые
   messages вручную. Used IDs остаются использованными; старый unknown после доказанного
   stop/reopen не становится completed, но не блокирует input нового поколения.
6. Для удаления выполните explicit stop, затем `POST /sessions/:sessionId/delete {}`.
   `{deleted:true}` означает удаление зарегистрированного native file и metadata, не
   чужих файлов или tool effects. Pending операции блокируют delete. Partial failure
   остаётся ошибкой; matching explicit retry может завершить durable delete intent.

Чтобы зарегистрировать существующую owned историю в configured native root, запросите
`GET /native-sessions`, затем `POST /sessions/:sessionId/register {nativeId}`. Register
не запускает Pi. Catalogue не ищет по всему Pi home; raw path не принимается. Невалидные
файлы, symlink/hardlink selection и неоднозначные UUID не предлагаются; binding уже
зарегистрированной сессии не получает второго владельца. Сторонний Pi/writer должен
быть независимо остановлен оператором: daemon не принимает чужой PID под управление.

При `storage-failed` не повторяйте ввод автоматически: новый эффект мог быть не допущен,
а ID уже зарезервирован. Explicit owned cleanup остаётся возможен; после восстановления
записи уже наблюдённый stop proof может сохранить clean snapshot без повторного port.stop.
При `native-invalid` не подменяйте историю пустым файлом: missing/corrupt/replaced и
attempted-empty history не сбрасываются. Header пустой NEW reservation пишет Pi в первой
launch attempt; eligibility для повторной empty initialization долговечно снимается
до spawn. `native-owned` означает конфликт binding.

После crash leftover `.llm-sessiond.lock` не удаляется/перехватывается автоматически.
Оператор сначала независимо доказывает отсутствие прежнего writer/child перед safe
recovery собственных каталогов. Dirty metadata остаётся unknown и unowned для нового
daemon; его собственный пустой port не может подтвердить остановку старого child.
Не обещаны crash-consistent outcome каждого live события, event replay, secure erase,
hostile same-user filesystem защита или rollback внешних effects.

## 4. Завершите работу

Вызовите authenticated POST `/sessions/:sessionId/stop` с JSON `{}` для отдельной
сессии; затем POST `/shutdown` с `{}` либо SIGINT/SIGTERM для daemon cleanup.
Читайте сводку: unknown не all-cleaned и не гарантирует выход процесса.
После завершения удалите owned config. Разрыв SSE сам по себе сессию не останавливает;
replay нет. Display text не secret-filtered, Native tools сохраняют права child.
Проверенный Windows сценарий — API fake smoke, не full Native Pi certification;
границы платформ и cleanup определяет [нормативный API](contracts/surfaces/local-daemon-api.md).
