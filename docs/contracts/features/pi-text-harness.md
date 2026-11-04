# Pi text harness

Status: approved

## Goal
Отдельный HarnessPort для штатного Pi 1.5 subprocess RPC: start, text send,
текст сессии, отдельный terminal и честная остановка; core не меняется.

## Affected surfaces
[Session core](../surfaces/session-core.md) остаётся неизменным.
Native adapter surface пока отсутствует; контракт активен до независимой приёмки.

## Scenarios
Readiness подтверждается коррелированным успешным get_state, не spawn.
Свой prompt ACK started и следующий причинный agent_start связывают input с run.
agent_end и промежуточные retry/error не терминальны; кандидат — agent_settled.
Финальный assistant stopReason stop/toolUse при aborted=false означает completed;
error/aborted означает definitive failed только с согласованным финальным evidence.
Недостающее/противоречивое evidence означает input-failed certainty unknown.
handled/queued/неизвестная disposition возвращает unknown: последующие анонимные
runs не принадлежат такому input. Core блокирует send до явной cleanup.
ACK не terminal; ранний terminal и поздние continuation A не меняют новый B.

## Non-goals
Нет SDK, модели/agent loop, persistence, UI/permission protocol, произвольного
session replacement, гарантий окончания фоновой extension работы или sandbox.
Native tools/skills/MCP/extensions/templates остаются собственностью Pi и включены.
Нет retry/replay, скрытого fallback, raw RPC/stderr/config/prompt в public output.

## Interfaces and constraints
Экспортируемый adapter реализует существующий HarnessPort, владеет одним child
на сессию; trusted executable/launch config, shell:false, --mode rpc --no-session.
Без resume/continue/session/fork/initial prompt и отключающих native resources flags.
Child env копируется без PI_PACKAGE_DIR; parent env не меняется. Только stdlib.
Unique command IDs и input record существуют до write; LF JSONL с optional CR,
streaming UTF8, backpressure и непрерывное чтение stdout обязательны.
Только assistant text_delta публикуется session-scoped, не thinking/tools/message_end.
Ошибки/потеря канала/write или ACK deadline/malformed/truncated outcome — unknown;
при подтверждённом активном run асинхронная потеря даёт input-failed unknown.
Stop confirmed только после observed exit/close owned child (включая сохранённый
факт exit); unknown сохраняет ownership и допускает новую явную cleanup.
EOF, signal return, abort ACK, timeout не подтверждают stop. Чужие ресурсы не чистятся.
Production/test authored files <=100 строк; без codegolf и новых dependencies/config.

## Acceptance
Fake Node RPC child доказывает matching/readiness, isolation, Unicode fragmented
LF/CRLF, фильтрацию output, own started/run boundary, retries и final evidence,
handled/queued unknown, early terminal/late ACK, stale events, channel/write/exit/
deadline uncertainty, unknown stop и последующую cleanup, cleanup всех fixtures.
Native capabilities не отключены; случайный PI_PACKAGE_DIR не наследуется.
Core (четыре файла), package/lock/config и donor node_modules неизменны.

## Validation
npm run typecheck; npm test (118 старых тестов плюс новые); docs checker;
git diff --check; budgets/donor/core/dependency/config diff; clean local commits.
Реальная Pi/model/provider генерация и credentials reads запрещены без отдельного
operator consent. Независимая приёмка нужна перед завершением контракта.
