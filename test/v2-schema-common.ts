import { z } from "zod";
import { safeErrorSchema } from "../src/api/v2-error.js";
import { v2SessionIdSchema } from "../src/api/v2-session-schema.js";

export const sessionId = v2SessionIdSchema;
export const empty = z.strictObject({});
export const session = z.strictObject({
  id: sessionId,
  harnessId: z.string(),
  cwd: z.string(),
  status: z.enum(["starting", "running", "stopped", "failed", "uncertain"]),
  name: z.string().optional(),
  nativeSessionId: z.string().optional(),
  adapterOptions: z.record(z.string(), z.unknown()).optional(),
  failureReason: z.string().optional(),
  failedAt: z.string().optional(),
});
export const sessionResponse = z.strictObject({ session });
export const safeError = safeErrorSchema;
