# API v2 bridge messages

## Frame rules

Every WebSocket object is strict and has `apiVersion:"v2"`; absent optional fields stay absent. Correlation IDs are strings and are never credentials. `request.succeeded` and `request.failed` correlate every request ID.

## Connection and selection

- `server.hello {apiVersion:"v2",type:"server.hello",protocolRevision:1,instanceId,connectionId}`.
- `client.open {apiVersion:"v2",type:"client.open",requestId,protocolRevision:1,callbacks:string[]}`; callback names are `tool.permission` and `agent.file.send`.
- Open ack: `request.succeeded {apiVersion:"v2",type:"request.succeeded",requestId,result:{protocolRevision:1,instanceId,connectionId}}`.
- Guard set: `guard.set {apiVersion:"v2",type:"guard.set",requestId,contextId,generation,sessionId:SessionId|null}`. Ack uses `request.succeeded.result:{contextId,generation,sessionId}`.
- Failure: `request.failed {apiVersion:"v2",type:"request.failed",requestId,error:SafeError}`. SafeError requires `code,message,category,outcome,reference`; optional `inputId,failure,resumed,adapterError` are omitted unless applicable. Category is `validation|not-found|unsupported|conflict|unavailable|uncertain|internal`; outcome is `not-applied|applied|unknown`. Adapter error is `{namespace,version,code}` only.

## Guarded controls

Common fields: `apiVersion,type:"control.request",requestId,sessionId,guard:{contextId,generation},timeoutMs`. Strict variants append exactly:

- Reload: `operation:"reload"`.
- Command: `operation:"command.run",name,remainder`.
- Extension: `operation:"extension",namespace,version,name,input`.

Success is correlated `request.succeeded`. Reload result is `{reloaded:true}`; command result is `{disposition:"handled"|"accepted",output?}`; extension result is `{version,output:JsonValue}`. Guard cancellation request is `{apiVersion:"v2",type:"control.cancel",requestId,targetRequestId}`; success result is `{outcome:"not-dispatched"|"unknown"}`. It never cancels an input or claims rollback.

## Callback lease and payloads

- Bind request `{apiVersion:"v2",type:"callback.bind",requestId,sessionId}`; ack result `{bindingId,sessionId}`. Unbind `{apiVersion:"v2",type:"callback.unbind",requestId,bindingId}`; ack result `{}`. Another live binding returns 409 conflict; no lease stealing.
- Callback request common fields: `{apiVersion:"v2",type:"callback.request",callbackId,bindingId,sessionId,deadlineAt,kind,payload}`; permission additionally requires `inputId`.
- Permission payload is `{toolName,input,context}`. `toolName` is <=128 chars; `input` is a JSON object <=32 KiB. Context is strict and may contain `suggestions?:JsonValue[]` (max 8) and optional string fields `toolUseId,agentId,blockedPath,decisionReason,title,displayName,description` (each <=512 chars).
- File payload is `{path,caption?}`; path <=4096 chars/no NUL, caption <=1024 code points. Payload has no file bytes or recipient identities.

## Callback results

`callback.result {apiVersion:"v2",type:"callback.result",callbackId,bindingId,result}` has exactly one result variant: permission `{kind:"permission",behavior:"allow"}` or `{kind:"permission",behavior:"deny",message,interrupt:false}`; file `{kind:"file",fileName,delivered,recipients}` with safe integers and `0<=delivered<=recipients`; safe failure `{kind:"failure",error:SafeError}` with all required SafeError fields (`code,message,category,outcome,reference`) and only permitted optional fields. Failure category/outcome use SafeError enums; message is a safe mapped string, never a raw exception. Server-generated cancel is `{apiVersion:"v2",type:"callback.cancel",callbackId,reason}` where reason is `timeout|input-canceled|session-stopped|client-disconnected|daemon-shutdown`. Wrong binding/connection, duplicate, stale, or late result is rejected without changing outcome.
