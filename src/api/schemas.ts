import { z } from "zod";

export const sessionCreateSchema = z.strictObject({
  harnessId: z.literal("pi"),
  cwd: z.string().min(1),
  name: z.string().optional(),
});
export const inputSchema = z.strictObject({
  text: z.string(),
  images: z
    .array(
      z.strictObject({
        mimeType: z.string().min(1),
        data: z.string().min(4),
      }),
    )
    .optional(),
});
export const cancelSchema = z.strictObject({ inputId: z.string().uuid() });
export const emptySchema = z.strictObject({});
export const apiErrorCodeSchema = z.enum([
  "INVALID_CWD",
  "INVALID_JSON",
  "INVALID_PATH",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "INPUT_BUSY",
  "INPUT_UNCERTAIN",
  "INPUT_FAILED",
  "INPUT_NOT_CURRENT",
  "CANCEL_FAILED",
  "SESSION_NOT_RUNNING",
  "SESSION_NOT_RESUMABLE",
  "RESUME_FAILED",
  "LIMIT_EXCEEDED",
  "INTERNAL_ERROR",
]);
export const sessionStatusSchema = z.enum([
  "starting",
  "running",
  "stopped",
  "failed",
  "uncertain",
]);
export const inputStateSchema = z.enum([
  "pending",
  "accepted",
  "completed",
  "failed",
  "uncertain",
]);
export const failureSchema = z.strictObject({
  code: z.enum([
    "PI_STARTUP_FAILED",
    "PI_RESUME_FAILED",
    "PI_PROCESS_EXITED",
    "PI_MALFORMED_JSON",
  ]),
  at: z.string().datetime(),
});
export const sessionSummarySchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().optional(),
  harnessId: z.literal("pi"),
  cwd: z.string(),
  status: sessionStatusSchema,
  nativeSessionId: z.string().optional(),
  failure: failureSchema.optional(),
});
export const errorSchema = z.strictObject({
  error: z.strictObject({ code: apiErrorCodeSchema, message: z.string() }),
});
export const healthResponseSchema = z.strictObject({
  apiVersion: z.literal("v1"),
  status: z.literal("ready"),
  version: z.string(),
});
export const harnessesResponseSchema = z.strictObject({
  harnesses: z.array(
    z.strictObject({
      id: z.string(),
      label: z.string(),
      capabilities: z.array(z.string()),
    }),
  ),
});
export const sessionsResponseSchema = z.strictObject({
  sessions: z.array(sessionSummarySchema),
});
export const sessionResponseSchema = z.strictObject({
  session: sessionSummarySchema,
});
export const inputResponseSchema = z.strictObject({
  inputId: z.string().uuid(),
});
