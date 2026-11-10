# Приватная конфигурация daemon

Config задаёт оператор, не HTTP-клиент. Здесь полный справочник полей и безопасная форма создания файла.

## Создание и ввод

В подготовленном checkout с Node.js 24 создайте собственный временный файл. POSIX-пример печатает только путь, не token:

```sh
node --input-type=module <<'JS'
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
const file = join(mkdtempSync(join(tmpdir(), 'sessiond-')), 'config.json');
writeFileSync(file, JSON.stringify({
  token: randomBytes(32).toString('base64url'), port: 3000,
}), { mode: 0o600 });
console.log(file);
JS
```

Ограничьте доступ к файлу и каталогу текущим оператором. В Windows нужен ACL: Unix mode его не заменяет. Не включайте config в Git. Token никогда не передавайте через argv, env, URL или log; Native CLI не получает token через startup config. Это не защита от враждебного процесса того же пользователя.

[daemon-cli](../src/daemon-cli.ts) без аргументов читает один UTF8 JSON object из stdin до EOF, максимум 65536 bytes. [API CLI](contracts/surfaces/api-cli-client.md) читает файл по `--config`; ему нужен UTF8 **без BOM**. Порядок запуска — в [руководстве](local-daemon-api.md).

## Поля

Других корневых полей нет; неизвестные поля отклоняются до запуска listener/child.

| Поле | Допустимое значение |
| --- | --- |
| `token` | Обязательная строка 32–256 символов `A-Z a-z 0-9 _ -` |
| `port` | Integer 0–65535; отсутствие/null → 3000; 0 выбирает свободный порт |
| `launch` | Pi launch object; отсутствие/null → `{}` |
| `harnesses` | Необязательный object: module ID → launch object; map и entries не null |

Launch object содержит только:

- `executable`, `cwd`: непустые строки; defaults — `pi`/`claude` и текущий рабочий каталог;
- `prefixArgs`: массив строк, default `[]`;
- `stopDeadlineMs`: конечное число >0, default 5000 ms. Это предел ожидания stop, не command deadline.

Transport flags добавляет [Pi](contracts/surfaces/pi-text-harness.md) или [Claude](contracts/surfaces/claude-code-harness.md) adapter. Model, permissions, history и settings задаёт Native CLI, не дополнительные launch fields. Запуск доверенного executable с native resources — не sandbox.

## Выбор модуля

Сервер знает только `pi` и `claude-code`, default — `pi`. `harnesses.pi` **целиком заменяет** root `launch`, не объединяется с ним. Claude использует только `harnesses['claude-code']` либо свои defaults; Pi cwd/args не наследуются.

Неизвестный configured ID отклоняется до factory/bind/spawn. Клиент проверяет форму map, но не серверный registry. HTTP selector выбирает зарегистрированный модуль, не executable, import path или launch settings.

При `port:0` возьмите фактический `listening.port`; клиенту нужен `--port ACTUAL_PORT`, автоматического discovery нет. Ошибки startup выводятся как `daemon startup failed`, без config/private причины.

Источник схемы: [daemon-config.ts](../src/daemon-config.ts), выбор: [daemon-harnesses.ts](../src/daemon-harnesses.ts). [Границы безопасности](safety-and-validation.md).
