# API v2 bridge events and snapshots

## Event envelope

All frames are strict `apiVersion:"v2"` objects. Live events use `{apiVersion:"v2",type:"event",instanceId,sequence,at,event}`; sequence is a positive safe integer increasing within instance. `event` is the exact discriminated payload below.

## Standard harness event payloads

`{kind:"harness.event",sessionId,event}` carries one strict event union:

- Output/status: `{kind:"output"|"status",text}`.
- Error: `{kind:"error",text,fatal?,stop?}`. `stop={reason,exit?,channel?}`; reason is `process_exited|stream_corrupted|stdout_not_closed|stdout_closed_early|channel_failed|event_stream_failed`; channel is `stdin|stdout|stderr`.
- Input: `{kind:"input",inputEvent:{inputId,state,detail?,failure?}}`; state is `pending|accepted|completed|failed|uncertain`; failure `{reason,text?}` with reason `prompt_rejected|hold_timeout|held_and_stopped|canceled`.
- Activity: `{kind:"activity",activityEvent}`. Exact variants: thinking `{type:"thinking",active}`; tool start `{type:"tool_start",toolCallId,summary}`; tool end `{type:"tool_end",toolCallId,failed?,detail?}`; thought `{type:"thought",text}` (one-line summary only); task `{type:"task",goal,progress?,status,step,limit?}`; agent notice `{type:"agent_notice",text}`; notification `{type:"notification",text,level?,widgetKey?}`.
- Anomaly: `{kind:"anomaly",anomalyEvent:{kind,action,ref,running,stopRequested?,recordType?,command?,bytes?,detail?}}`. Kind/action use registered generic string tokens. `head` and `diagnosticTail` are forbidden from public payloads.

Other exact event variants are `session.changed {kind:"session.changed",session}`, `session.deleted {kind:"session.deleted",sessionId}`, and adapter event `{kind:"extension",namespace,version,name,data}` validated by its registered versioned schema. No raw reasoning, prompt, stack, or raw error is exposed.

## Snapshot barrier

Snapshot frames are strict:

- Begin: `{apiVersion:"v2",type:"snapshot.begin",snapshotId,afterSequence}`.
- Session: `{apiVersion:"v2",type:"snapshot.session",snapshotId,session}`.
- End: `{apiVersion:"v2",type:"snapshot.end",snapshotId}`.

The daemon emits begin, zero or more session frames, then end; no live event can interleave. Events committed after the captured boundary follow end. Snapshot sequence is not a durable cursor. Reconnect uses a new instance handshake and snapshot; no history/replay or exactly-once guarantee. Queue overflow disconnects rather than dropping frames.
