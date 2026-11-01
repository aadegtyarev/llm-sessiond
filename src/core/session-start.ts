import type { HarnessAdapter, HarnessSession } from "./ports.js";
import type { SessionRecord } from "./types.js";
import type { EventBus } from "./event-bus.js";
import { connectSessionEvents } from "./session-runtime-events.js";
import { watchSessionExit } from "./session-exit.js";

export async function startSession(
  adapter: HarnessAdapter,
  record: SessionRecord,
  runtimes: Map<string, HarnessSession>,
  events: EventBus,
  publishStatus: (record: SessionRecord) => void,
  publishInterruptedInput: (record: SessionRecord) => void,
  nativeId?: string,
): Promise<void> {
  const generation = ++record.runtimeGeneration;
  const runtime = await adapter.launch(record, nativeId);
  if (generation !== record.runtimeGeneration) {
    await runtime.stop();
    return;
  }
  runtimes.set(record.id, runtime);
  record.child = runtime.child;
  record.nativeSessionId = runtime.nativeSessionId;
  record.status = "running";
  publishStatus(record);
  connectSessionEvents(
    record,
    runtime,
    events,
    publishStatus,
    () => record.runtimeGeneration === generation,
  );
  watchSessionExit(
    record,
    runtime,
    generation,
    publishInterruptedInput,
    publishStatus,
  );
}
