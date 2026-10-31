import type { EventBus } from "./event-bus.js";
import type { HarnessSession } from "./ports.js";
import type { SessionRecord } from "./types.js";

export function connectSessionEvents(
  record: SessionRecord,
  runtime: HarnessSession,
  events: EventBus,
  publishStatus: (session: SessionRecord) => void,
): void {
  runtime.onEvent((type, data) => {
    if (type === "session.error") {
      record.status = "failed";
      record.failure = {
        code: String(data.code),
        at: new Date().toISOString(),
      };
      publishStatus(record);
      void runtime.stop().catch(() => {});
    }
    if (
      type === "input.state" &&
      data.state === "uncertain" &&
      record.status === "running"
    ) {
      record.status = "uncertain";
      publishStatus(record);
    }
    if (type === "input.state" && data.state === "completed")
      record.currentInput = undefined;
    if (type === "turn.completed" && record.status === "uncertain") {
      record.status = "running";
      publishStatus(record);
    }
    events.publish(record.id, type, data);
  });
}
