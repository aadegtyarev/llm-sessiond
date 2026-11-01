import { z } from "zod";

export const sessionId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
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
export const safeError = z.strictObject({
  code: z.string(),
  message: z.string(),
  category: z.enum([
    "validation",
    "not-found",
    "unsupported",
    "conflict",
    "unavailable",
    "uncertain",
    "internal",
  ]),
  outcome: z.enum(["not-applied", "applied", "unknown"]),
  reference: z.string(),
  inputId: sessionId.optional(),
  failure: z
    .strictObject({
      reason: z.enum([
        "prompt_rejected",
        "hold_timeout",
        "held_and_stopped",
        "canceled",
      ]),
      text: z.string().optional(),
    })
    .optional(),
  resumed: z.literal(true).optional(),
  adapterError: z
    .strictObject({
      namespace: z.string(),
      version: z.number().int(),
      code: z.string(),
    })
    .optional(),
});
