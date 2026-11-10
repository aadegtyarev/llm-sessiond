# События: подписка и интерпретация

Здесь описаны события Native CLI и локальной сессии. Это наблюдения, не универсальный статус выполнения.

## Подписка и разрыв

Откройте authenticated GET `/events` **до start**. Подписка устанавливается до первого frame: `event: ready`, `data: {}`, пустая строка. Далее: `event: core`, `data: <CoreEvent JSON>`, пустая строка. Вопрос возможен до HTTP start response.

[CLI events](contracts/surfaces/api-cli-client.md) выдаёт NDJSON `{event,data}`. Чистый EOF после ready на границе frame даёт exit0, не подтверждая завершение Native. Разрыв сокета или обрезанный frame дают exit1; записанный prefix сохраняется. Нет истории, SSE IDs, replay/resume или reconnect. Разрыв не отменяет команду и не останавливает сессию: проверьте get/list, при необходимости явно stop. Не повторяйте действия автоматически.

## Поля

[CoreEvent](../src/types.ts): `session` содержит `session:SessionView`; остальные варианты — локальный `sessionId` и поля:

| `type` | Поля |
| --- | --- |
| `text` | `text:string` |
| `tool`, `phase:start` | `toolCallId`, `toolName`, `args` |
| `tool`, `phase:update` | те же IDs, `args`, `partialResult` |
| `tool`, `phase:end` | IDs, `result`, `isError:boolean`, optional `durationMs` |
| `question` | `question:{requestId,method,title,timeout?}` + поля метода ниже |
| `notification`, `method:setStatus` | `statusKey`, optional `statusText`; отсутствие текста очищает status |
| `notification`, `method:notify` | `message`, `level:info/warning/error`; default info |
| `native-record` | `record`: полный native JSON object |

IDs, имена и тексты — строки. Display `args/partialResult/result` — JSON: null, boolean, конечное число, строка, массив или object таких значений. `timeout` и `durationMs` — конечные неотрицательные ms. Confirm добавляет `message:string`, select — `options:string[]`, input — optional `placeholder:string`. [Ответы на вопросы](native-commands.md#ответы-на-вопросы-pi) явные; notification ответа не требует.

## Источники

Pi публикует assistant `text_delta` и whitelist tool/question/notification. Невалидные observations и private RPC fields не передаются. Thinking, stderr, raw RPC и повторный message-end text не становятся display. Произвольные widgets/editor/renderer и полная native UI parity не поддерживаются.

Claude публикует stream `text_delta`, не final assistant text. Tool IDs — native; partial input JSON собирается по parent stream + block index. End возникает только по `tool_result` известного tool, не block/message stop или turn result. Полные `result/control_request/control_cancel_request` идут как native-record с errors/usage/metadata, complex input, permission suggestions/tool IDs. Control responses возвращаются вызывающему command; system/thinking/signature/stderr не публикуются. Это не raw-all-native stream; Pi raw output не расширяется. [Адаптеры](contracts/surfaces/pi-text-harness.md), [Claude](contracts/surfaces/claude-code-harness.md).

## Маршрут и доставка

Core задаёт внешний `sessionId`, не `record.session_id`. Принимается актуальное поколение в starting/running без stop; native transition не меняет локальный маршрут. События не дают input correlation, thinking/liveness или подтверждения завершения всех background tasks.

Payload — отделённый глубоко замороженный snapshot. Получатели фиксируются при publish, каждому доставка не более раза; отписка влияет на будущие публикации. Вложенные события любых типов/сессий идут FIFO после доставки предыдущего всем получателям. Исключения и rejected Promise изолируются, async завершения не ожидаются. Зависший или бесконечно публикующий callback не изолирован. Очередь не история. [events.ts](../src/events.ts).

## Пределы

Максимум 32 streams; каждому ≤256 ожидающих frames и 1048576 bytes, включая Node writable buffer и следующий frame. Overflow/oversize закрывает stream без truncate/silent drop; полнота после loss не восстанавливается. Медленный stream не блокирует Core/других consumers. [Реализация](../src/daemon-stream.ts).

Display и полные native payload могут содержать секреты: фильтрации нет. [Безопасность](safety-and-validation.md), [ошибки API](api-reference.md#ошибки).
