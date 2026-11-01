import type { EventBus } from "./event-bus.js";
import type { HarnessSession } from "./ports.js";
import type { SessionRecord } from "./types.js";

export function connectSessionEvents(
  record: SessionRecord,
  runtime: HarnessSession,
  events: EventBus,
  publishStatus: (session: SessionRecord) => void,
  isCurrent: () => boolean,
): void {
  runtime.onEvent((type, data) => {
    if (!isCurrent()) {
      if (
        type === "input.state" &&
        ["completed", "failed", "uncertain"].includes(String(data.state))
      )
        events.publish(record.id, type, data);
      return;
    }
    if (type === "session.error") {
      record.status = "failed";
      record.runtimeGeneration++;
      record.pendingSubmit = undefined;
      if (record.currentInput) {
        events.publish(record.id, "input.state", {
          inputId: record.currentInput,
          state: "uncertain",
          reason: "session failed before input completion",
        });
        record.currentInput = undefined;
      }
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
    if (
      type === "input.state" &&
      (data.state === "completed" || data.state === "failed") &&
      data.inputId === record.currentInput
    )
      record.currentInput = undefined;
    if (type === "turn.completed" && record.status === "uncertain") {
      record.status = "running";
      publishStatus(record);
    }
    events.publish(record.id, type, data);
  });
}
