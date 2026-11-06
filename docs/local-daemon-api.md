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

## Постоянные native-сессии: S1, до полной приёмки

[Согласованная фича](contracts/features/native-session-lifecycle.md) остаётся pending;
независимый review, native/platform проверки и обновление durable contracts ещё впереди.
Без следующих настроек сохраняется прежний in-memory режим с `--no-session`.

Оператор может добавить в stdin config пару `stateDir` и `nativeSessionDir` (оба
непустые пути). Первый каталог содержит только приватные metadata; их имена кодируют
case-sensitive session IDs в lowercase base32 с безопасным префиксом (включая `Foo`/`foo`,
`CON`, `.leading` и ID длины128), а не используют ID как raw basename. Второй —
непосредственные `.jsonl` native files. Это не рекурсивный поиск по всему Pi home.
Для новых сессий cwd берётся из `launch.cwd` либо cwd daemon; импорт использует cwd
native header. Защитите оба каталога правами/Windows ACL. В HTTP пути не передаются.

| Authenticated операция | Body / результат |
| --- | --- |
| GET `/native-sessions` | `[{nativeId}]`: валидные однозначные native UUID в доверенном каталоге |
| POST `/sessions/:sessionId/register` | `{nativeId}` → SessionView; существующий native file, без запуска |
| POST `/sessions` | `{sessionId}` → SessionView; в persistent режиме резервирует новый пустой file |
| POST `/sessions/:sessionId/start` | `{}`; created либо explicit reopen stopped, точный `--session` file |
| POST `/sessions/:sessionId/delete` | `{}` → `{deleted:true}`; только stopped без незавершённых операций |

Native Pi сам пишет header/history, allocation filename не является native UUID.
Инициализировать пустой file разрешено только NEW reservation, ещё не проходившей
launch attempt. Durable start intent снимает это разрешение до запуска: unknown
attempt с оставшимся пустым файлом не получает повторную пустую инициализацию даже
после доказанного stop. Никогда не запускавшаяся пустая сессия остаётся startable.
Stop сохраняет историю; clean shutdown освобождает свои ownership gates. Новый
процесс с теми же настройками восстанавливает registry без запуска Pi. Used input IDs
не освобождаются при reopen; старый unknown input не превращается в completed и не
мешает новому вводу после доказанного stop/reopen. Нет prompt/event mirror или replay.
Пропавшая/невалидная/подменённая история не заменяется пустой. Hardlinks, symlink files
и неоднозначные UUID не импортируются. Partial delete не объявляется успехом;
повторный explicit delete завершает только ранее записанный intent, проверяя identity
оставшегося файла. Startup ничего не удаляет.

Каждый canonical root эксклюзивно занят `.llm-sessiond.lock` (`wx`, mode0600, без PID).
Второй compliant daemon с любым общим root откажет до командных эффектов. При startup
failure освобождаются только свои захваченные gates; после uncertain/failed cleanup
они остаются. После crash leftover locks **не удаляются/перехватываются автоматически**:
оператор сначала независимо доказывает отсутствие прежнего child/writer и только
затем выполняет безопасное восстановление собственных каталогов. Dirty metadata
после такого recovery восстанавливается как unknown: новый daemon не принимает
чужой PID и не выдаёт собственный пустой port за доказательство его остановки.
Сторонний Pi, игнорирующий gate, и hostile same-user filesystem mutation не защищены.

Дополнительные безопасные Core/API error codes: `storage-failed`, `native-invalid`,
`native-owned` (HTTP409); private filesystem/native diagnostics не публикуются.
Metadata I/O синхронно выполняется на command boundaries до новых эффектов и перед
clean completion, не внутри subscriber. Запись каждого live terminal/SSE event и
crash-consistent outcome snapshots не обещаются.

## 4. Завершите работу

Вызовите authenticated POST `/sessions/:sessionId/stop` с JSON `{}` для отдельной
сессии; затем POST `/shutdown` с `{}` либо SIGINT/SIGTERM для daemon cleanup.
Читайте сводку: unknown не all-cleaned и не гарантирует выход процесса.
После завершения удалите owned config. Разрыв SSE сам по себе сессию не останавливает;
replay нет. Display text не secret-filtered, Native tools сохраняют права child.
Проверенный Windows сценарий — API fake smoke, не full Native Pi certification;
границы платформ и cleanup определяет [нормативный API](contracts/surfaces/local-daemon-api.md).
