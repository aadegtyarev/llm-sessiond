# Наблюдение взаимодействий Native Pi

Статус: реализация и fake/native повторная проверка выполнены; ожидает required CI,
независимого Terra review и приёмки. Feature остаётся active.
Действует [контракт разработки](../development.md).

## Цель и граница

Проверить Core → Pi RPC → реальная LLM → native tools/questions/statuses → Core,
записать пробелы, затем исправить подтверждённые пробелы и повторить те же сценарии.
Потребитель получает публичное наблюдение взаимодействий и минимальную операцию
явного ответа на native question; UI и внешний API не создаются.

## Затронутые поверхности

- [Session core](../surfaces/session-core.md).
- [Pi text harness](../surfaces/pi-text-harness.md).
- Правила lifecycle: [метаконтракт](../meta-contract.md).

## Сценарии

- Обычное текстовое уточнение модели, явный следующий текстовый ответ пользователя
  и продолжение; текст не выдаётся за структурированный native question.
- Реальная native запись файла только в принадлежащем задаче временном каталоге;
  результат проверяется на диске, а не только по словам модели.
- Наблюдение tool start/update/end с идентификаторами, позволяющими связать lifecycle;
  payload для будущего потребителя, а не собственный tool loop или UI.
- Native confirm/select/input: наблюдение запроса и явный ответ именно на него.
  Scripted ответы допустимы только для наших benign namespaced fixture requests;
  неизвестный native request требует остановиться и запросить решение оператора.
- Честные статусы и неопределённость при неполном evidence, потере канала,
  незавершённом вопросе и остановке; cleanup подтверждается наблюдённым owned exit.

## Интерфейсы и ограничения

Публичное наблюдение и минимальная операция ответа расширяют существующую границу
Core/HarnessPort только в пределах подтверждённых валидацией пробелов. Точные типы
и разбиение реализации заранее не выбираются. Pi сохраняет владение agent/model/
tool loop, native tools, skills, MCP, extensions, templates и авторизацией.
Native `extension_ui_response` не имеет обычного ACK: запись ответа не доказывает
его получение или потребление Pi; обещать подтверждённое потребление нельзя.

Сохраняются один владелец, отсутствие generic engine/forwarding hierarchy,
input retry/replay/fallback; ACK не settlement; точное владение либо explicit
unknown; session-scoped text; snapshot получателей при publish, FIFO и изоляция.
Наблюдения не должны обходить эти гарантии или воскрешать остановленную сессию.
Production core/interface остаются в четырёх файлах: `src/types.ts`,
`src/core.ts`, `src/events.ts`, `src/harness-session.ts`. Искусственный лимит
100 строк отменён оператором; ясность и разделение по ответственности обязательны.

Не публиковать private config, raw RPC, stderr, credentials и private diagnostics.
Явные tool/question payload для отображения отделяются от private diagnostics;
отображаемый model/tool text не объявляется свободным от секретов.
Реальные вызовы модели/tools разрешены лишь для bounded validation. Файловые
эффекты модели — только task-owned temp directories, не репозиторий/user files.
Не читать секретные конфиги напрямую; не менять установку Pi 1.5.0, зависимости,
node_modules donor, global config или соседние проекты; без deploy.
Публикация feature branch/PR и required CI разрешены штатным workflow.
Native resources не отключать, Pi SDK/runtime dependency не добавлять.

## Нецели

UI/client, внешний API, permissions engine, произвольный native parity, история,
постоянное хранение, MCP network audit, автономное approve/cancel чужих диалогов.

## Приёмка и порядок проверки

1. На неизменённом production baseline `c0344d4bc2b8638f727a3d03a59371d271b2df54`
   выполнить bounded validation перечисленных сценариев и сохранить наблюдения:
   что проходит, чего не хватает, что неизвестно; без реализации до этой проверки.
2. Перед исправлениями получить disposition родителя по записанным пробелам;
   изменённая поверхность или acceptance scope требуют нового одобрения.
3. Последовательно внести компактные исправления только доказанных пробелов;
   добавить regression coverage для затронутых классов случаев, не одного примера.
4. Повторить те же fake/native сценарии, `npm run typecheck` и `npm test`;
   проверить точные ID, явные ответы, честность статусов, наблюдения и cleanup.
   Сохранить полные evidence без усечения/минификации ради лимита authored files.
5. Terra review и приёмка родителем обязательны. После проверки обновить обе
   surface contracts, отметить feature complete для final verification и удалить
   временный feature contract по метаконтракту; до этого не заявлять завершение.

Приёмка требует воспроизводимых результатов до/после, списка подтверждённых
исправлений и остаточных ограничений; нет обещания arbitrary native parity.
Baseline evidence сохранено в task artifacts; paid baseline не повторяется.
После fake regression checks повторяется тот же bounded native сценарий.

## Результат проверки перед review

- Typecheck и 1272 fake/core/protocol теста прошли (база 1184).
- Одна post-fix direct Pi сессия: уточнение, явный текстовый ответ, native write/read
  и disk verify; публичные tool start/update/end, status set/clear и три concurrent
  confirm/select/input; ответы через Core.reply, ожидаемый tuple в tool result,
  completed final и наблюдённый native exit/close. Временный файл удалён.
- Core.reply возвращает written только как результат локальной записи, не native
  ACK/consumption. Consumption в проверке доказан отдельно tool result.
- Fake tests покрывают invalid/session/method/duplicate/expired/channel/stop,
  startup observations, immutable snapshots, FIFO/reentry и listener isolation.
  Native cancellation/timeout races не прогонялись отдельной платной матрицей.
- Durable surfaces и удаление active feature — только после required CI/приёмки.
