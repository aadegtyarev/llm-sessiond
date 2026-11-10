# Native команды и результаты

Выберите payload своего Native CLI.

## Отправка

Подпишитесь на [events](events.md), выполните start. В running без stop отправляйте объект через POST `/sessions/:sessionId/command` или CLI `command ID < request.json`. Wrapper нет; CLI передаёт **исходную stdin строку**, не пересериализует JSON.

Pi prompt:

```json
{"type":"prompt","message":"Привет","streamingBehavior":"followUp"}
```

Claude user:

```json
{"type":"user","message":{"role":"user","content":"Привет"},"session_id":"","parent_tool_use_id":null}
```

Это формы по source, не реальные результаты. Daemon не подменяет параметры, не применяет allowlist/file/domain guards и не делает readback/proof запросов. `streamingBehavior` выбирает клиент, default не добавляется. [Native ownership и отсутствие settings mirror](safety-and-validation.md#данные-и-native-владение).

## Результаты

| Ввод | HTTP200 результат |
| --- | --- |
| Pi command | Весь response: `id/type/command/success`, data/error и любые optional fields; UUID id генерирует adapter |
| Claude control_request | Весь control_response по nested `response.request_id`, включая native error/metadata |
| Claude user/explicit control_response/прочие one-way | Только `{kind:'written'}`: local callback + drain |
| Pi reply | `{kind:'written'/'rejected'/'unknown'}`: локальный исход, не native ACK |

Pi `success:false` и Claude control error остаются HTTP200/exit0. Written не подтверждает приём, исполнение или завершение Native. Потеря ожидаемого response →409 `harness-unknown`; уже полученный сохраняется.

```mermaid
sequenceDiagram
    participant C as Клиент
    participant D as Daemon/adapter
    participant N as Claude
    C->>D: GET /events + bearer
    D-->>C: SSE ready
    Note over C,N: Далее running
    alt control_request
        C->>D: command control_request
        D->>N: JSONL request_id
        N-->>D: control_response response.request_id
        D-->>C: HTTP200 control_response
    else one-way record
        C->>D: command user/explicit-answer
        D->>N: JSONL record
        par Локальная запись
            D->>D: callback + drain
            D-->>C: HTTP200 written
        and result если получен
            N-->>D: result
            D-->>C: SSE core native-record
        end
        Note over C,N: written/result не упорядочены; user-result FIFO нет
    end
```

Result завершает native turn, не все background tasks. Pending control не блокирует interrupt/explicit answer. Ожидание не запускает deadline, retry/reset/abort/restart. [Wire Pi](contracts/surfaces/pi-text-harness.md), [Claude](contracts/surfaces/claude-code-harness.md#команды-и-результаты).

## Сжатие Pi

POST `/sessions/:sessionId/compact` принимает строго `{}` либо:

```json
{"customInstructions":"Сохрани решения и открытые задачи"}
```

Это command `type:compact`; extra fields/нестроковые инструкции →400. Response сохраняет summary/firstKeptEntryId/tokensBefore и optional metadata. CLI принимает ноль bytes как `{}`, whitespace-only →exit2. Параллельные Pi RPC коррелируются по id, не FIFO; compact не блокирует abort/UI reply. Busy/queued/handled/refusal решает Pi. Pi 1.5 compact начинает с `await abort()`, не продолжая прерванный run. Claude compact/shortcut →409 `harness-rejected` **без write** или эмуляции summary/readback.

## Ответы на вопросы Pi

POST `/sessions/:sessionId/reply` или CLI `reply` с исходными requestId/method:

```json
{"requestId":"question-id","method":"confirm","confirmed":true}
```

Select/input: `value:string`; отмена любого метода: `cancelled:true` вместо ответа. Extra fields запрещены. RequestId — непустая строка, ограниченная только body limit. Неверный ID/method этой сессии →rejected без write. Вопрос зарегистрирован до публикации: можно ответить немедленно, в том числе при starting. Параллельные вопросы не заменяют друг друга. Expiry/options и повторные ответы решает Pi; autoanswer/retry/replay нет. Отсутствие ACK не unknown; физическая loss — unknown.

## Явный ответ Claude

Получив control_request из native-record и явно решив отказать, отправьте command:

```json
{"type":"control_response","response":{"subtype":"success","request_id":"REQUEST_ID_FROM_RECORD","response":{"behavior":"deny","message":"Явный отказ оператора"}}}
```

Сохраните request_id; complex permissions не сводятся к boolean. Autoapprove/deny/bypass нет. Pi-style reply →rejected; startup UI/permission parity не обещана.

Native tools имеют права child; payload не secret-filtered. [Безопасность](safety-and-validation.md), [ошибки и body limits](api-reference.md).
