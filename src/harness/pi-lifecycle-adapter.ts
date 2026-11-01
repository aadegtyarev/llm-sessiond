import type { HarnessAdapter } from "../core/adapter-contracts.js";
import type { JsonValue } from "../core/generic-json.js";

export const PI_CHECKPOINT = { namespace: "pi.session", version: 1 } as const;
export const piDescriptor = {
  id: "pi",
  aliases: [],
  capabilities: [
    "harness.launch",
    "harness.resume",
    "harness.stop",
    "input.submit",
  ],
};

export function piCheckpoint(sessionId: string) {
  return { ...PI_CHECKPOINT, data: { sessionId } };
}

export function isPiCheckpoint(value: JsonValue): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, JsonValue>;
  return (
    Object.keys(data).length === 1 &&
    typeof data.sessionId === "string" &&
    data.sessionId.length > 0 &&
    data.sessionId.length <= 4096
  );
}

export class PiLifecycleAdapter implements HarnessAdapter {
  readonly descriptor = piDescriptor;
  readonly checkpoint = PI_CHECKPOINT;
  validateCheckpoint(value: JsonValue): boolean {
    return isPiCheckpoint(value);
  }
  isResumable(checkpoint: {
    namespace: string;
    version: number;
    data: JsonValue;
  }): boolean {
    return (
      checkpoint.namespace === PI_CHECKPOINT.namespace &&
      checkpoint.version === PI_CHECKPOINT.version &&
      isPiCheckpoint(checkpoint.data)
    );
  }
}
