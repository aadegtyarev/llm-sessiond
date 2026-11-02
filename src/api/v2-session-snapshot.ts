import type { DurableSession } from "../persistence/session-record.js";
import { v2SessionSchema } from "./v2-session-schema.js";

export function snapshotV2Session(record: DurableSession) {
  const value = {
    id: record.id,
    harnessId: record.harnessId,
    cwd: record.cwd,
    status: record.status,
    ...(record.name !== undefined ? { name: record.name } : {}),
    ...(record.nativeSessionId !== undefined
      ? { nativeSessionId: record.nativeSessionId }
      : {}),
    ...(record.adapterOptions !== undefined
      ? {
          adapterOptions: JSON.parse(
            JSON.stringify(record.adapterOptions),
          ) as unknown,
        }
      : {}),
    ...(record.failureReason !== undefined
      ? { failureReason: record.failureReason }
      : {}),
    ...(record.failedAt !== undefined ? { failedAt: record.failedAt } : {}),
  };
  return v2SessionSchema.parse(value);
}
