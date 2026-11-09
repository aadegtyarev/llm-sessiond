# Подключаемые harness-модули: Claude Code

Статус: **COMPLETE** — реализация принята, поведение перенесено в durable surfaces,
локальные документационные проверки пройдены. Контракт сохранён для финальной проверки
закоммиченного docs-кандидата родительской сессией; затем она выполняет cleanup по
метаконтракту. Это не утверждение merge, deployment или rollout.

## Цель и наблюдаемое поведение

Подключить Claude Code как модуль к harness-agnostic ядру: один daemon одновременно
обслуживает независимые Pi и Claude Code сессии через существующие API/CLI/SSE.
Подключаемость — базовый контракт, не опциональная надстройка. Native CLI владеет
agent/model/tool loop, permissions, историей, очередью и настройками; daemon — локальным
lifecycle, маршрутизацией и своими процессами. Прежний Pi путь остаётся совместимым.

## Сценарии

- Внешний клиент подписывается на SSE, создаёт сессию с выбранным модулем, запускает её,
  отправляет native JSON и получает display-события, полный ответ либо честный local write.
- Pi и Claude Code работают одновременно без смешения команд, событий и cleanup.
  Неизвестный module ID отклоняется до эффектов create; create без selector сохраняет Pi default.
- Claude native initialize подтверждает start. User write не ждёт result; result/error
  приходят асинхронно. Долгое ожидание не блокирует interrupt или явный permission answer;
  несколько control replies могут приходить не по порядку запросов.
- Native permission request доставляется целиком и получает только явный native ответ
  оператора. Автоматического решения нет; старые Pi question/reply продолжают работать.
- Разрыв/EOF/malformed wire не выдумывает ACK, response или остановку. Полученный ответ
  не теряется при последующем разрыве; неизвестный исход незавершённого запроса честно
  сообщается. Stop подтверждается только наблюдением выхода собственного процесса.

## Затронутые поверхности

До планирования, реализации и review участники читают этот контракт целиком и:

- [Ядро сессий](../surfaces/session-core.md).
- [Pi text harness](../surfaces/pi-text-harness.md).
- [Локальный daemon API](../surfaces/local-daemon-api.md).
- [Командный API CLI клиент](../surfaces/api-cli-client.md).
- [Claude Code harness](../surfaces/claude-code-harness.md) — новая durable native boundary.

Также обновлены [руководство API](../../local-daemon-api.md) и [README](../../../README.md).
Текущее поведение описано в этих поверхностях, не в отдельной будущей платформе. Жизненный цикл —
[метаконтракт](../meta-contract.md), работа — [контракт разработки](../development.md).

## Интерфейсы и ограничения

### Модули и совместимость

- Общий нейтральный module/port контракт и явный registry передаются/компонуются вне Core.
  Module IDs непрозрачны для Core: никаких `if pi/claude/codex`, enum имён, конкретных
  backend imports или знания native protocol shape. Composition root регистрирует `pi`
  и `claude-code`, выбирает Pi default; третий fake ID подключается без изменения Core.
- `POST /sessions` принимает `{sessionId,harness?:string}` только для зарегистрированного
  модуля; неизвестный ID отклоняется до создания записи/публикации/запуска
  (существующий `harness-rejected` допустим). HTTP ID не превращается в путь импорта.
  CLI принимает префикс `--harness ID` только для create; старые вызовы валидны.
- Явный выбор доступен в get/list/session events, где необходим; прежний двухполевый
  `SessionView {sessionId,status}` для default сохраняется по возможности. Нет привязки
  local identity к native history/session ID. Старые Pi API/HTTP/SSE формы сохраняются.
- Trusted root config дополняется optional `harnesses`: module ID → launch options
  (`executable`, `prefixArgs`, `cwd`, `stopDeadlineMs`). Legacy `launch` сохраняет
  Pi-compatible/default значение. Нужные transport flags принадлежат адаптеру, не Core;
  model/permissions/history defaults принадлежат пользователю/native CLI.
- Существующие config/CLI/source consumers, включая `new SessionCore(port)`, сохраняются
  минимально, без спекулятивного compatibility stack. Команда остаётся native JSON object
  с `type:string`, не новым универсальным model API.

### Native команды, результаты и события

- Общая граница command/outcome/event нейтральна, не эмуляция Pi RPC. Полные native Pi
  ответы и прежняя семантика не меняются. Claude использует stdin/stdout JSONL stream-json.
  Коррелированный `control_request` получает полный native `control_response`, включая
  ошибки/usage/metadata/неизвестные optional поля; без придуманных Pi `id/command/success`.
- Для Claude корреляция control replies — по `response.request_id`, не Pi `id` и не FIFO.
  `user`, явный `control_response` и прочие one-way записи возвращают лишь local `written`
  после callback + drain, либо честный rejected/unknown: не model acceptance/completion.
  Штатное отсутствие ACK не transport loss. Нет prompt→result resolver или своей очереди.
- Полные native `result`, `control_request`, `control_cancel_request` доступны как новый
  session-scoped native-record event в существующем SSE `core` frame. Native поля,
  включая errors/usage/metadata, сохраняются. `result` завершает native turn, но не
  доказывает завершения всех фоновых задач. Корреляция result с отдельным user не выдумывается.
- Display text/tool нормализуются; thinking и private diagnostic dumps не публикуются.
  Явные полные ответы/native records — product output, не разрешение логировать private
  config/stderr. Сохраняются source/generation gating, snapshots, порядок и изоляция
  подписчиков существующего Core; replay/history не добавляется.
- Permission `control_request` и явный native `control_response` проходят без потерь.
  Нет autoapprove/deny/bypass, forced permission policy или default tool/resource bans.
  Сложный Claude input не сужается до boolean и не объявляется Pi UI parity.
  Существующая Pi question/reply семантика совместима; native ответы идут без подмены.
- Pi-only conveniences не эмулируются: compact shortcut на Claude без подлинного native
  пути честно отклоняется. Нет придуманного Claude `get_state/model/compact`, скрытых
  readbacks, settings mirror, retry, private session helpers или своего run controller.

### Процесс, канал и безопасность

- Adapter владеет только своим процессом/каналом, framing, backpressure, native-ID
  correlation, display routing и наблюдаемым cleanup. Сессии имеют независимые процессы.
  Readiness Claude — успешный native initialize, не spawn/таймер/платный warmup prompt.
- Reference initialize: `{type:'control_request',request_id,request:{subtype:'initialize',hooks:null}}`;
  ответ — `control_response.response` с `subtype:'success'|'error'`, `request_id` и
  native `response|error`. Native user содержит `message:{role:'user',content:...}`,
  `session_id`, `parent_tool_use_id`; `can_use_tool` сохраняет весь request/input/tool IDs.
  Никаких выдуманных гарантий per-user request ID у native result.
- Полученный correlated response сохраняется при позднем loss, в том числе до local drain;
  потеря ожидаемого неполученного ответа — unknown. Ожидание не даёт deadline/retry/abort.
  UTF8 декодируется потоково, JSONL framing и write backpressure честны.
- Stop confirmed — только наблюдённый own exit/close (либо сохранённый факт выхода).
  EOF/kill return/timeout не cleanup proof; unknown сохраняет owned cleanup responsibility.
  Нет чужого PID adoption/deletion и гарантий descendant/remote/all-background cleanup.
- Token остаётся private stdin → API header, не argv/env/log/child config. Существующие
  loopback/auth/transport limits/privacy сохраняются. Native tools сохраняют свои права,
  sandbox/secret filtering product text не обещаются. Node24, без installs/dependency updates.

Основание native границы: уже проверенные metadata/help Claude Code **2.1.311**,
[официальный headless](https://code.claude.com/docs/en/headless),
[CLI reference](https://code.claude.com/docs/en/cli-reference) и reference-only wire sources
[query.py](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/main/src/claude_agent_sdk/_internal/query.py),
[subprocess_cli.py](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/main/src/claude_agent_sdk/_internal/transport/subprocess_cli.py),
[types.py](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/main/src/claude_agent_sdk/types.py).
Required native transport/permission-host flags проверяются по этим источникам, не
изобретаются; reference SDK controllers/auth/history code не переносится и SDK не ставится.
Не принуждать `--bare`, `--safe-mode`, `--no-session-persistence`,
`--dangerously-skip-permissions` или эквивалентную смену native policy.

## Нецели

Codex модуль/стаб; dynamic plugin discovery/loading произвольного кода; SDK dependency
или capability framework; собственные permissions/history/registry/queue/settings/run/
summary/compaction engines; отключение native resources; восстановление старых удалённых
API/command контрактов. Нет release/deploy/install/restart службы или vNext rollout.
Исторические ветки, старый draft PR13 и данные сохраняются; работающий release/service
не меняется, как и global Pi/Claude/auth/profile/trust/unit/config.

## Критерии приёмки

1. Внешний CLI/API → fake Claude JSONL process проверяет create/start с initialize,
   user written, text/tool, полный result и native error, control correlation и interrupt
   при pending запросе, permission request/явный ответ, stop. Полные native поля не теряются.
2. Смешанные Pi + Claude сессии изолированы; третий инъецированный fake module ID работает
   без правок Core. Unknown module не имеет create effects; старые create/CLI/config/
   single-port consumers работают. Pi-only shortcut на Claude честно rejected.
3. Регрессии покрывают out-of-order replies, отсутствие prompt-result FIFO, no-ACK writes,
   EOF/loss/malformed wire, UTF8/backpressure, response-before-loss, честный cleanup,
   privacy, snapshots/source gates и отсутствие thinking/private diagnostics в display.
   Все прежние Pi регрессии проходят.
4. Полный fake suite и typecheck; три существующих external smoke плюс новый Claude
   external fake smoke проходят на Linux и Windows. Required both-success guard,
   `checks` с `always()`, gitleaks и protections не ослабляются; donor не меняется.
5. Независимый review обязателен перед итоговой поставкой; согласованные поверхности
   отражают только проверенное поведение. Fake proof не называется real integration.

## Валидация и завершение

Для реализации: `npm run typecheck`, `npm test`, `npm run test:api-smoke` (включая новый
Claude external fake smoke), проверки ссылок/docs и CI Linux/Windows по критериям выше.
Настоящие Claude/model/auth/provider/large-context/Native Windows проверки требуют
отдельно одобренных модели и бюджета. Native Pi бюджет исчерпан; реальные native/model
запуски не разрешены. Не выполнять `claude -p`, model/auth probes или SDK install.

Реализация принята независимым source review после исправления UTF8 prefix framing.
Source candidate `1bc46469f917afc081932dd8b685cf7a347ff6ed`: typecheck, 530/530 fake tests
и четыре external Node fake smoke прошли на Linux. Required
[CI](https://github.com/aadegtyarev/llm-sessiond/actions/runs/42665266675) на том же source
HEAD завершён SUCCESS: Linux/Windows external smoke, Linux checks и gitleaks.
Windows CI проверяет именно четыре external Node fake smoke, не полный suite/native CLI.

Durable transfer охватывает Core, Pi, Claude, daemon API, API CLI, README и operator guide;
source/test/package/CI при этом не изменены. После добавления auto-discovered Claude
surface guard локально пройдены docs checker, surface-docs 14/14, README FakePort example,
typecheck, полный fake suite 531/531 и четыре Linux external Node fake smoke.
Native CLI/provider/auth/model/context и Native Windows в этой фиче не запускались
и не сертифицированы; metadata/help и official wire-source research не real integration.

Следующий lifecycle gate принадлежит родительской сессии: независимая финальная docs
приёмка и проверка committed candidate, затем удаление этого временного контракта,
финальный required CI и обычный PR/merge workflow. В этом проходе контракт остаётся
присутствующим и закоммиченным. Service/release/deploy/restart не разрешены.
