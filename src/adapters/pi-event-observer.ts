import type {
  HarnessEvent,
  ActivityEvent,
} from "../interfaces/runtime-ports.js";
import { mapPiRecord } from "../harness/pi-event-mapper.js";
import { settledPiInput } from "./pi-input.js";
import type { PiProcess } from "./pi-process.js";
import type { PiProfile } from "./pi-descriptor.js";

export function observePiProcess(
  id: string,
  process: PiProcess,
  profile: PiProfile,
  emit: (event: HarnessEvent) => void,
): void {
  process.rpc.subscribe((record) => {
    if (!process.ready) return;
    if (record.type === "__terminal") {
      emit({ kind: "ended", sessionId: id });
      return;
    }
    if (record.type === "agent_settled") {
      const inputId = settledPiInput(process);
      if (inputId)
        setImmediate(() => emit({ kind: "settled", sessionId: id, inputId }));
    }
    for (const event of mapPiRecord(record))
      publishMapped(event, id, profile, emit);
  });
}
function publishMapped(
  event: { type: string; data: Record<string, unknown> },
  sessionId: string,
  profile: PiProfile,
  emit: (event: HarnessEvent) => void,
): void {
  if (event.type === "assistant.delta" && typeof event.data.text === "string")
    emit({ kind: "output", sessionId, text: event.data.text });
  else if (profile === "v1" && event.type === "activity")
    emit({
      kind: "activity",
      sessionId,
      activity: event.data as unknown as ActivityEvent,
    });
  else if (
    profile === "v1" &&
    event.type === "notification" &&
    typeof event.data.text === "string"
  )
    emit({ kind: "notification", sessionId, text: event.data.text });
}
