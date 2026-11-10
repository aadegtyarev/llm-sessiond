# Pi text harness

[createPiHarness(PiLaunch)](../../../src/pi-harness.ts) реализует `HarnessPort<NativeResponse>` для штатного Native Pi **1.5** RPC. `NativeResponse` — совместимый Pi export, не общий envelope. [Core](session-core.md) управляет локальным доступом; адаптер владеет своим процессом/каналом на сессию, framing, backpressure и корреляцией. Модуль `pi` — default composition; выбор Claude не меняет его гарантий.

Pi владеет историей, persistence, настройками, очередью и agent loop. Полные [native команды/ответы](../../native-commands.md), [события](../../events.md), [config](../../daemon-config.md), [безопасность и проверки](../../safety-and-validation.md) — обязательные части контракта.

## Запуск

Доверенный executable по умолчанию `pi`; prefixArgs/cwd и stopDeadlineMs задаёт оператор. Deadline конечный >0, default 5000ms: только ожидание stop. [Launch](../../../src/pi-process.ts) добавляет `--mode rpc`, не принуждает `--session/--no-session` или private extensions. `shell:false`; команды — JSON data, не shell args. Child env копирует parent без `PI_PACKAGE_DIR`, глобальное окружение не меняется. Native tools сохраняют права child, sandbox нет.

Readiness требует коррелированный успешный get_state с object data, не spawn/таймер. Нет file identity proof, разбора истории, восстановления model/effort или idle policy. Неудачный start сохраняет child для явной очистки.

## Команды и вопросы

Адаптер генерирует UUID id **до write**, передаёт type/параметры без allowlist/defaults и возвращает весь response с ошибками и metadata. Параллельные запросы коррелируются по id, не FIFO; проверяются type/command/success. `success:false` — native ответ, не потеря канала. Readback/proof запросов нет.

JSONL читается непрерывно: streaming UTF8, LF с optional CR, stdin backpressure. Ожидание без deadline не запускает abort/retry/restart. Compact не блокирует другие RPC, abort или UI reply. Промежуточные/tool/agent события не завершают RPC/run; busy/refusal решает Pi. [Native compact](../../native-commands.md#сжатие-pi) сам вызывает await abort(), не продолжая прерванный run.

[QuestionReply](../../native-commands.md#ответы-на-вопросы-pi) проверяет форму и известный ID/method этой сессии, сохраняя native id. Вопрос регистрируется до публикации; параллельные вопросы независимы. Expiry/options и повторные ответы решает Pi. Written требует callback+drain; отсутствие штатного ACK не unknown. Write deadline и автоматических ответов/retry/replay нет; stop/loss закрывает маршрут.

## Потеря канала и остановка

Ошибки framing/schema/write, EOF, child error/exit/close или stop закрывают wire. Неполученные RPC дают unknown; полученный полный response сохраняется даже при разрыве до drain. Нормальное ожидание не ломает канал.

Stop закрывает stdin и посылает SIGTERM только своему child. Confirmed требует наблюдённый exit/close либо сохранённый факт выхода; EOF, kill return, abort ACK и timeout недостаточны. Unknown сохраняет ответственность за новую явную очистку; поздние события закрыты. После idle exit Core.get автоматически не обновляется: async session-status события нет. Следующий command обнаруживает потерю, явный stop использует факт выхода. [Гонки и admission](session-core.md#остановка-и-завершение-работы) обязательны.

## Нормативные границы

Полный command response возвращается вызывающему, не raw RPC stream. Display ограничен [полями/источниками](../../events.md#источники); [правила доставки](../../events.md#маршрут-и-доставка) обязательны. Native session switch не меняет маршрут. Произвольные widgets, titles и editor не поддерживаются.

Display/response могут содержать секреты. [Все нецели и ограничения](../../safety-and-validation.md) сохраняются: доверие к штатному RPC, отсутствие собственной history/settings логики, отдельное согласие на реальные Native проверки.
