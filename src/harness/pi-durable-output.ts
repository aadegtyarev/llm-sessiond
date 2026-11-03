import type { EventEmitter } from "node:events";

export function publishPiDurableRecord(
  emitter: EventEmitter,
  record: Record<string, unknown>,
): void {
  emitter.emit("event", record);
  const output = piDurableOutput(record);
  if (output) emitter.emit("output", output);
}

export function piDurableOutput(
  record: Record<string, unknown>,
): { kind: "output"; text: string } | undefined {
  const update = record.assistantMessageEvent;
  if (
    record.type !== "message_update" ||
    update === null ||
    typeof update !== "object" ||
    (update as Record<string, unknown>).type !== "text_delta" ||
    typeof (update as Record<string, unknown>).delta !== "string"
  )
    return undefined;
  const text = (update as Record<string, unknown>).delta;
  return typeof text === "string" ? { kind: "output", text } : undefined;
}
