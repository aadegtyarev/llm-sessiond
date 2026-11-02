import { z } from "zod";

export const v2SessionIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
export const v2SessionCreateSchema = z.strictObject({
  cwd: z.string().min(1),
  harnessId: z.string().optional(),
  name: z.string().optional(),
  adapterOptions: z.record(z.string(), z.unknown()).optional(),
  confirmedDangerousOptions: z.array(z.string()).optional(),
  callbackConnectionId: z.string().optional(),
});
export const v2EmptySchema = z.strictObject({});
export const v2SessionSchema = z.strictObject({
  id: v2SessionIdSchema,
  harnessId: z.string(),
  cwd: z.string(),
  status: z.enum(["starting", "running", "stopped", "failed", "uncertain"]),
  name: z.string().optional(),
  nativeSessionId: z.string().optional(),
  adapterOptions: z.json().optional(),
  failureReason: z.string().optional(),
  failedAt: z.string().optional(),
});
export const v2SessionsResponseSchema = z.strictObject({
  sessions: z.array(v2SessionSchema),
});
export const v2SessionResponseSchema = z.strictObject({
  session: v2SessionSchema,
});
