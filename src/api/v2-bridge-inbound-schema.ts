import { z } from "zod";
import { v2SessionIdSchema } from "./v2-session-schema.js";
import { safeErrorSchema } from "./v2-error.js";

const api = { apiVersion: z.literal("v2") };
export const v2BridgeCorrelation = { ...api, requestId: z.string().min(1) };
export const v2GuardSetSchema = z.strictObject({
  ...v2BridgeCorrelation,
  type: z.literal("guard.set"),
  contextId: z.string(),
  generation: z.number().int().nonnegative(),
  sessionId: v2SessionIdSchema.nullable(),
});
export const v2CallbackBindSchema = z.strictObject({
  ...v2BridgeCorrelation,
  type: z.literal("callback.bind"),
  sessionId: v2SessionIdSchema,
});
export const v2CallbackUnbindSchema = z.strictObject({
  ...v2BridgeCorrelation,
  type: z.literal("callback.unbind"),
  bindingId: z.string(),
});

const guard = z.strictObject({
  contextId: z.string().min(1),
  generation: z.number().int().nonnegative(),
});
const commonControl = {
  ...v2BridgeCorrelation,
  type: z.literal("control.request"),
  sessionId: v2SessionIdSchema,
  guard,
  timeoutMs: z.number().int().positive(),
};
export const v2ControlRequestSchema = z.union([
  z.strictObject({ ...commonControl, operation: z.literal("reload") }),
  z.strictObject({
    ...commonControl,
    operation: z.literal("command.run"),
    name: z.string(),
    remainder: z.string(),
  }),
  z.strictObject({
    ...commonControl,
    operation: z.literal("extension"),
    namespace: z.string(),
    version: z.number().int().positive(),
    name: z.string(),
    input: z.unknown(),
  }),
]);
export const v2ControlCancelSchema = z.strictObject({
  ...v2BridgeCorrelation,
  type: z.literal("control.cancel"),
  targetRequestId: z.string().min(1),
});

const permissionResult = z.union([
  z.strictObject({
    kind: z.literal("permission"),
    behavior: z.literal("allow"),
  }),
  z.strictObject({
    kind: z.literal("permission"),
    behavior: z.literal("deny"),
    message: z.string(),
    interrupt: z.literal(false),
  }),
]);
const fileResult = z
  .strictObject({
    kind: z.literal("file"),
    fileName: z.string(),
    delivered: z.number().int().nonnegative().safe(),
    recipients: z.number().int().nonnegative().safe(),
  })
  .refine((result) => result.delivered <= result.recipients);
const failureResult = z.strictObject({
  kind: z.literal("failure"),
  error: safeErrorSchema,
});
export const v2CallbackResultSchema = z.strictObject({
  ...api,
  type: z.literal("callback.result"),
  callbackId: z.string(),
  bindingId: z.string(),
  result: z.union([permissionResult, fileResult, failureResult]),
});
export const v2UnsupportedRequestSchema = z.union([
  v2ControlRequestSchema,
  v2ControlCancelSchema,
  v2GuardSetSchema,
  v2CallbackBindSchema,
  v2CallbackUnbindSchema,
  v2CallbackResultSchema,
]);
