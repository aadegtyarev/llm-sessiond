import type { HarnessSession } from "./ports.js";
import type { SessionRecord } from "./types.js";

export function watchSessionExit(
  record: SessionRecord,
  runtime: HarnessSession,
  generation: number,
  publishInterruptedInput: (session: SessionRecord) => void,
  publishStatus: (session: SessionRecord) => void,
): void {
  runtime.child.once("exit", (code) => {
    if (generation !== record.runtimeGeneration) return;
    if (record.status !== "running" && record.status !== "uncertain") return;
    record.status = code === 0 ? "stopped" : "failed";
    if (record.status === "failed")
      record.failure = {
        code: "PI_PROCESS_EXITED",
        at: new Date().toISOString(),
      };
    publishInterruptedInput(record);
    record.currentInput = undefined;
    record.pendingSubmit = undefined;
    record.runtimeGeneration++;
    publishStatus(record);
  });
}
