# Локальный daemon API

Статус: approved.

## Цель и наблюдаемое поведение

Внешний клиент управляет локальными сессиями из отдельного процесса без импорта нашего TypeScript: HTTP/JSON для операций и SSE для событий. Фича поставляется целиком, как один законченный end-to-end результат, а не серия частичных поставок.

## Затронутые поверхности и пути

- Сохраняются гарантии [SessionCore](../surfaces/session-core.md) и [Native Pi text adapter](../surfaces/pi-text-harness.md).
- Новая durable поверхность после приёмки: `docs/contracts/surfaces/local-daemon-api.md` (пока не существует).
- Затрагиваются локальный daemon/API и checkout entrypoint в `src/`, API/client fixtures и проверки в `test/`, CI в `.github/workflows/`, команды проверки/запуска и документация по необходимости.
- Процесс изменения и завершения: [development](../development.md), [meta-contract](../meta-contract.md).

## Интерфейсы и ограничения

- HTTP/JSON + SSE через TCP только `127.0.0.1`, с настраиваемым портом. Unix sockets и Windows named pipes исключены. Нет публичного bind, CORS или browser UI.
- Обязательный bearer token на каждом запросе, включая SSE. Токен не логируется и не помещается в URL; loopback не заменяет authentication.
- Операции: create/start/get/list/send/reply/stop session и shutdown daemon. Запуск из checkout, без установки systemd/Windows service.
- Один daemon владеет одним Core и своими Native Pi processes. Launch settings — доверенная операторская конфигурация; HTTP не является generic raw-RPC/executable gateway.
- SSE передаёт все шесть типов CoreEvent: session/input/text/tool/question/notification. Сохраняются session/native IDs, порядок и исходы без придуманной input correlation. Есть явный stream-ready: подписка устанавливается до start.
- HTTP ACK не равен settlement; reply `written` не означает native consumption. Сохраняются Core/native ownership, terminal, FIFO, immutable и unknown semantics.
- Transport/schema/auth ошибки различимы; публичные Core ошибки передают безопасный `CoreError.code`. Private exceptions/config, raw RPC и stderr наружу не идут. Явный display text не объявляется secret-filtered.
- Malformed и oversize requests отклоняются до Core. Медленный клиент не блокирует Core: выходная очередь конечна; overflow закрывает поток, без silent drop/truncate.
- Используются нынешний Core и Node 24 standard library; отдельных foundations и новых runtime dependencies не требуется. Не добавляются generic engine, registry, SDK или второй event bus. Вырезанные исторические daemon/API/SDK реализации не возвращаются.

## Сценарии и ошибки

- Клиент сначала получает stream-ready, затем создаёт/запускает сессию, отправляет текст, наблюдает события и явно отвечает на native questions; get/list показывают текущее состояние, stop явно инициирует cleanup.
- Разрыв клиента не повторяет команду и не доказывает остановку сессии. Истории/replay нет: после stream loss полнота наблюдения потеряна; доступны current-state queries и explicit stop. Неопределённый исход не выдаётся за успех.
- Shutdown прекращает admission, использует существующий cleanup и возвращает честную сводку; unknown не означает all-cleaned.
- Fake integration покрывает session isolation, invalid/wrong/duplicate IDs, auth, channel loss и uncertain outcomes, startup/reentry, backpressure/overflow и shutdown.

## Критерии приёмки

1. Независимый внешний client → daemon → Core → Pi проходит: stream-ready → create/start → text clarification/explicit answer → native write/read + disk verify → три concurrent confirm/select/input → explicit API replies → публичный tool result с consumed tuple → completed → observed owned exit/stop/shutdown.
2. Все публичные доказательства этого сценария получены через HTTP/SSE. Прямой Core или raw diagnostics не заменяют публичное evidence; disk verify подтверждает реальный file effect.
3. Assertions находятся вне isolated subscribers/Port boundaries; используется существующий fixtureHealth latch. Readiness и порядок доказываются причинными сигналами, не sleeps для навязывания порядка.
4. Пройдены весь существующий Linux suite, typecheck, docs checks и релевантные API fake tests. Отдельный API smoke выполняется на Linux и в actual Windows CI с тем же protocol/client scenario; это не обещание full Native Pi или old full-suite Windows certification.
5. Required checks/gitleaks реально имеют COMPLETED SUCCESS, включая зависимость checks от Windows smoke; без settings bypass и изменений protections/merge policy.
6. После whole validation, Terra review и parent acceptance durable docs описывают принятую поверхность; временный feature contract проходит complete/verify/remove. Доставка — normal PR/CI/protected squash, не частичный результат.

## Валидация

- Для реализации выполнить `npm run typecheck`, `npm test`, docs checks, API fake integration и отдельный API smoke на Linux и Windows CI; проверить итоговые required checks/gitleaks и зависимость от Windows smoke.
- Этим согласием явно разрешена одна bounded real Pi validation Linux session: до трёх user inputs, штатный native tool loop, только известные benign namespaced fixture answers; file effects только в owned temp. Неизвестный blocking dialog требует STOP/ask. Без paid retries/campaigns; сохраняются существующие Pi 1.5/default resources, без отключающих flags/SDK.
- До начала и каждого возобновления разработки прочитать development и этот approved feature contract. Новый scope или реальная невозможность полного результата требуют STOP и обращения к оператору, не дробления обещанного.
- Глобальные настройки, соседние проекты, установка Pi и donor node_modules не меняются; deploy/установка службы не выполняются. Решения, приёмка и merge принадлежат parent; один writer.

## Нецели

UI/harnessd/Telegram/ClaudeCode, persistence/recovery/history/replay, SDK, permissions engine, catalog/models management, TCP remote exposure, sandbox/descendant cleanup guarantees и deployment.
