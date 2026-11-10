# Запустить сессию из checkout

Путь ниже использует Node.js 24 и подготовленный checkout, без установки службы. Внешнему клиенту достаточно HTTP/JSON и SSE; импорт TypeScript не нужен. [Нормативная граница](contracts/surfaces/local-daemon-api.md), [HTTP справочник](api-reference.md).

## Подготовьте приватный config

[Создайте собственный config](daemon-config.md#создание-и-ввод), сохранив напечатанный путь. Файл и каталог должны быть приватными; Windows требует ACL. Token не передавайте через argv/env/URL/log. Launch settings задаёт оператор, не HTTP-клиент.

## Запустите listener

Из корня checkout передайте JSON и EOF:

```sh
node src/daemon-cli.ts < /path/to/config.json
```

PowerShell: `Get-Content -Raw $config | node src/daemon-cli.ts`.

Дождитесь stdout JSON `listening.host/port`: это только bind. Listener/list/create не запускают Native CLI. **Start запускает доверенный Pi/Claude с его ресурсами и startup hooks. Tools работают с правами дочернего процесса, не в sandbox.** Нужен доступный выбранный CLI. Pi readiness требует успешный get_state, Claude — initialize success, не model warmup.

## Командный клиент из checkout

В другом терминале откройте поток:

```sh
node src/api-cli.ts --config /path/to/config.json events
```

Дождитесь NDJSON `{"event":"ready","data":{}}`, затем в третьем терминале:

```sh
node src/api-cli.ts --config /path/to/config.json create demo
node src/api-cli.ts --config /path/to/config.json start demo
```

Без selector выбран Pi. Для Claude замените create-строку на `node src/api-cli.ts --config /path/to/config.json --harness claude-code create demo`. Модуль закрепляется на весь lifecycle. Все флаги — перед операцией. При config `port:0` добавляйте `--port ACTUAL_PORT` из listening; discovery нет.

Следите за events уже во время start: Pi question может прийти до его завершения. [Явный reply](native-commands.md#ответы-на-вопросы-pi) использует исходные requestId/method, autoanswer нет.

Подготовьте `request.json` по [native справочнику](native-commands.md), затем отправьте один UTF8 JSON object без BOM до EOF:

```sh
node src/api-cli.ts --config /path/to/config.json command demo < request.json
```

PowerShell: `Get-Content -Raw request.json | node src/api-cli.ts --config /path/to/config.json command demo`.

Stdout — полный API JSON. Exit0 означает HTTP200, не native success/completion; written — только local write. Exit1 — API/transport failure, exit2 — local input error до запроса. [Полная CLI грамматика](contracts/surfaces/api-cli-client.md), [поля событий](events.md).

## Завершите работу

```sh
node src/api-cli.ts --config /path/to/config.json stop demo
node src/api-cli.ts --config /path/to/config.json shutdown
```

SIGINT/SIGTERM daemon используют тот же cleanup. Читайте сводку: unknown не all-cleaned; собственный child может остаться жив. Stop подтверждает только наблюдённый exit/close своего child либо сохранённый факт выхода, для created — локальную остановку без spawn. Stopped запись не перезапускается, после restart daemon список пуст.

Разрыв events не останавливает работу, replay нет: проверьте get/list, при необходимости явно stop, без автоматического повтора команд. Чистый SSE EOF означает закрытие потока, не completion.

После завершения удалите собственный config. Display/native payload не secret-filtered. [Безопасность, cleanup и проверенные платформы](safety-and-validation.md); [HTTP ошибки/лимиты](api-reference.md), [SSE overflow](events.md#пределы).
