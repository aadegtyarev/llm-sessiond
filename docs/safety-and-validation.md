# Безопасность и границы проверки

Эта страница помогает решить, чему доверять перед start и после cleanup.

## Границы доверия

Bearer обязателен даже на loopback и SSE. Держите [config](daemon-config.md) и каталог приватными; Windows требует ACL, не только Unix mode. Token не передают через argv/env/URL/log или Native startup config. Private exceptions/config/stderr не публикуются; Core не логирует prompts.

API намеренно возвращает полные native responses/records и display: они **могут содержать секреты**. Фильтрации секретов нет; это не разрешение публиковать payload или приватные диагностические данные оркестрации.

Start запускает доверенный Native executable с его ресурсами и startup hooks. Tools получают права child; `shell:false` не sandbox. Доверие к RPC и native resources не защищает от враждебной extension или поддельного протокола.

## Данные и Native владение

Локальные записи только в памяти; после restart daemon список пуст. Get/list показывают local lifecycle, не историю, model-run status или idle process-liveness.

Native CLI владеет history/persistence/transitions, settings, permissions, очередью и agent/model/tool loop. Daemon не создаёт history registry/locks, не выделяет/импортирует/удаляет native files, не разбирает headers и не восстанавливает settings из истории. Сохранённые files/metadata/locks не читаются, не мигрируют и не удаляются. Native history-команды проходят без wrapper target-file guards/settings mirror.

## Остановка

Created останавливается локально без spawn. Для запущенного child confirmed требует наблюдённый exit/close своего процесса либо сохранённый факт выхода. Возврат kill, EOF, abort ACK и timeout не доказывают остановку. Stopped запись нельзя запустить снова.

При unknown ответственность за cleanup сохраняется: свой child может остаться жив, выход daemon не гарантирован. До shutdown возможен новый явный stop; после closed публичный cleanup недоступен. Сводка shutdown описывает один обход, не историю или завершение всех конкурентных операций. Повторный shutdown возвращает тот же Promise, не новый cleanup. [Полная семантика гонок и admission](contracts/surfaces/session-core.md#остановка-и-завершение-работы).

Stop касается только собственного child, без PID adoption. Descendant/remote/all-background завершение не гарантируется; disconnect не stop. Нет secure erase или rollback tool effects. [Порядок завершения](local-daemon-api.md#завершите-работу).

## Чего не обещает daemon

Нет защиты от hostile same-user filesystem, universal recall/persistence/consumption/settlement, собственного history/permissions/settings/run engine, summarizer, UI renderer, SDK/private bridge или эмуляции отсутствующих native операций. Codex, dynamic plugin loading, generic executable gateway, browser UI, harnessd/Telegram, remote bind/Unix socket/named pipe и service installation/rollout не предоставляются. [Пределы HTTP](api-reference.md#пределы) и [SSE](events.md#пределы) не дают unbounded/lossless delivery.

## Проверки

В подготовленном checkout без установки зависимостей:

```sh
npm run typecheck
npm test
npm run test:api-smoke
```

Это FakePort/Node fake-child проверки, не Native/provider запуски. Linux покрыт fake suite/typecheck; внешние Node fake smoke проверены также в Windows CI. Это **не full-suite Windows или Native Windows certification**.

Реальный Linux smoke Sonnet 5.5 ограничен двумя базовыми turns: tools, permissions, compaction и persistence им не сертифицированы. Универсальной provider/auth/model/context гарантии нет. Реальные Native/model/provider проверки требуют отдельного согласия.

Источники: [Core](../src/core.ts), [Pi process](../src/pi-process.ts), [Claude process](../src/claude-process.ts), [scripts](../package.json). Изменения проходят [обязательный процесс](contracts/development.md); merge не deployment.
