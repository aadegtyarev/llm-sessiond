# Pi text harness

## Граница и владение

`createPiHarness(PiLaunch)` из [pi-harness.ts](../../../src/pi-harness.ts) реализует
`HarnessPort<NativeResponse>` для штатного Native Pi 1.5 subprocess RPC.
`NativeResponse` — совместимый Pi-specific type export, не обязательный envelope общего
port. Потребитель — [SessionCore](session-core.md), который владеет локальным lifecycle/access.
[Trusted composition](../../../src/daemon-harnesses.ts) регистрирует модуль `pi` как default;
выбор другого модуля не меняет Pi runtime guarantees.
Adapter владеет одним своим child и RPC channel на локальную сессию, framing, backpressure
и request-id correlation. Pi владеет native session/history/transitions/persistence,
execution queue, settings, acceptance/refusal, agent/model/tool loop и native resources.
Это доверительная граница штатного RPC и native resources, не защита от
произвольной враждебной extension или поддельного протокола.

## Запуск и ввод

`PiLaunch`: trusted executable (default `pi`), prefixArgs, cwd, `stopDeadlineMs`
(default 5000, finite >0). По умолчанию добавляется только `--mode rpc`, без принудительных
`--session/--no-session` и private extensions. Штатным session behavior владеет Pi.
Оператор контролирует trusted launch и права native resources; `shell:false`, команды —
JSON data. Child env копирует parent без `PI_PACKAGE_DIR`; global env не меняется.

Start требует коррелированный успешный `get_state` с object data, не spawn/таймер.
Нет session-file identity proof, history parsing, model/effort restoration или idle policy.
Неуспешная readiness оставляет owned child доступным для explicit cleanup.

Все native команды идут через один `command`: адаптер генерирует UUID `id` до write,
передаёт native `type`/параметры без allowlist/defaults и возвращает весь response,
включая Native error и optional metadata. Ответы нескольких pending запросов могут
приходить в обратном порядке; корреляция только по `id` с проверкой command/type/success.
`success:false` не transport loss. Нет автоматических proof/readback запросов после команд.
JSONL использует LF/optional CR, streaming UTF8, непрерывное чтение и stdin backpressure.

## Ожидание и граница native семантики

Busy/queued/handled/started/refusal принадлежат Pi. Нет wrapper execution queue,
run/input coordinator, response-wait deadlines или wait-triggered abort/restart/retry.
Долгий compact не сериализует ожидание ответов и не блокирует abort/UI reply.
Промежуточные/tool/agent события не завершают RPC и не доказывают model-run completion.
Pi 1.5 compact начинает с `await abort()` и не продолжает прерванный run.

Native history/files/transitions и настройки не валидируются/зеркалируются adapter.
Старые files/metadata/locks не читаются, не мигрируют, не удаляются. Native history-команды
передаются без target-file guards. Если операции нет в RPC, она не эмулируется SDK,
private extension или собственным controller.

## Output и source routing

Текст — только assistant `text_delta`, session-scoped, не привязан к input.
Thinking, stderr, raw RPC/errors/private config и повторный message_end text
не публикуются как события; это не сужение полного command response. Tool/question/notification публикуются только в нормализованной
форме для отображения, не как исходный RPC record. Assistant/tool/question и другой
явный display text не очищается от возможного чувствительного содержания.
Полный correlated Native response возвращается только вызывающему command; события
не превращаются в raw-event stream. Текст не получает выдуманный inputId.
События source/generation gated в Core; native session switch не меняет локальный маршрут.

## Tool, question и notification observations

Наблюдения идут через существующий HarnessPort → Core.subscribe, session-scoped,
без присвоения inputId. Они возможны при starting, без owned input и при running;
после stop gate/потери актуального источника не доставляются. Readonly публичные
payload отделены от private records и глубоко заморожены; FIFO, recipient snapshot
и изоляция подписчиков — по [контракту Core](session-core.md).

Native `tool_execution_start/update/end` нормализуются в `tool` с `phase`:

| Phase | Публичные поля |
| --- | --- |
| start | toolCallId, toolName, args |
| update | toolCallId, toolName, args, partialResult |
| end | toolCallId, toolName, result, isError, optional durationMs |

`toolCallId` связывает native lifecycle, не доказывает владение input. Display
args/results имеют JSON-форму; неизвестные private поля RPC record не передаются.
Malformed обязательные поля не публикуются как валидные observations.

Native `extension_ui_request` поддерживает три публичных question метода.
Общие поля: `requestId` из native id, `method`, `title`, optional `timeout` в ms.
Confirm добавляет `message`, select — `options` (строки), input — optional
`placeholder`. Adapter сохраняет вопрос до публикации; немедленный reply из
subscriber и несколько concurrent вопросов одной сессии допустимы.

Fire-and-forget `setStatus` даёт `notification` с method/statusKey и optional
statusText; отсутствие statusText означает очистку. `notify` даёт method/message
и level: только info/warning/error, default info при отсутствии native notifyType.
Это не общий статус thinking/liveness; ответ на notification не отправляется.
Widgets, titles, editor и произвольный renderer/native UI parity не поддерживаются.

## Явные ответы и неопределённость

`Core.reply(sessionId, QuestionReply)` доходит до optional HarnessPort.reply.
`requestId` и `method` должны совпадать с известным вопросом именно этой сессии:

| Метод | Явный ответ |
| --- | --- |
| confirm | confirmed: boolean |
| select | value: string |
| input | value: string |
| любой из трёх | cancelled: true вместо confirmed/value |

Проверяются shape и маршрут известного requestId/method именно этого соединения;
неверные дают rejected без write. Сохраняется исходный Native id. Expiry/options,
повторные ответы, consumption/idle/permission semantics определяет Pi, не adapter.

`extension_ui_response` не имеет normal command ACK. `written` — только успешный local
stdin callback + drain, НЕ receipt/consumption Pi. Физическая ошибка/loss дают unknown;
нет write deadline или invented Native response из-за отсутствия штатного ACK.
После stop/loss маршрут закрыт. Автоматических approve/cancel/retry/replay нет.

Реализация нормализации и ответа: [pi-interaction-events.ts](../../../src/pi-interaction-events.ts),
[pi-questions.ts](../../../src/pi-questions.ts), [pi-wire.ts](../../../src/pi-wire.ts).

## Остановка и ограничения

Stop закрывает stdin и посылает SIGTERM только owned child. Confirmed — только
после наблюдённого exit/close либо сохранённого факта выхода. EOF, kill return,
abort ACK и timeout не доказательства остановки. Unknown сохраняет ownership
для новой явной cleanup; старые события после stop не публикуются.
HarnessPort не имеет отдельного async session-status события: после idle exit
`Core.get` не обещает автоматически актуальный process-liveness; следующий
command получит harness-unknown, explicit stop использует сохранённый факт выхода.
Framing/schema error, write error, EOF, child error/exit/close и explicit stop закрывают
wire и все ожидающие без response RPC как unknown. Уже полученный полный Native response
не теряется при последующем разрыве до local drain. Нормальное ожидание не ломает wire.

Нет гарантии finished-all-background, descendant/remote cleanup, UI/permission parity,
provider/auth correctness или sandbox. Native tools сохраняют права child. Нет SDK,
private bridge, собственного UI renderer/history store/registry или same-user filesystem
защиты. Реальные Pi/model/provider проверки требуют отдельного consent.

## Проверки

`npm run typecheck`, `npm test`, `npm run test:api-smoke`: Node fake-child/wire/API/SSE
проверяют полные success/error/optional responses, reverse id correlation, delayed/busy
команды, independent connections, UTF8/backpressure, no-ACK replies, tool payloads,
реальные fake-channel loss/stop/shutdown races и privacy. Старые history/run/controls/
private-reload proofs удалены, не оставлены параллельным legacy путём.
Полный fake suite и typecheck проверены на Linux; четыре внешних Node fake smoke
(включая mixed Pi/Claude) прошли на Linux и в Windows CI. Обязательный smoke gate
и gitleaks прошли в CI. Это не full-suite Windows или Native Windows certification;
реальные Native CLI/provider/auth/model/context проверки в этой фиче не выполнялись.
Правила lifecycle — [метаконтракт](../meta-contract.md).
