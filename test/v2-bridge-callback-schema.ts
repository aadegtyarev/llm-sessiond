import { z } from "zod";
import { safeError, sessionId } from "./v2-schema-common.js";
import { bind, unbind } from "./v2-bridge-handshake-schema.js";
import {
  filePayload,
  permissionPayload,
} from "./v2-bridge-callback-payload.js";

const api = { apiVersion: z.literal("v2") };
const common = {
  ...api,
  type: z.literal("callback.request"),
  callbackId: z.string(),
  bindingId: z.string(),
  sessionId,
  deadlineAt: z.string().datetime(),
};
export const permissionRequest = z.strictObject({
  ...common,
  kind: z.literal("tool.permission"),
  inputId: z.string(),
  payload: permissionPayload,
});
export const fileRequest = z.strictObject({
  ...common,
  kind: z.literal("agent.file.send"),
  payload: filePayload,
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
  .refine((r) => r.delivered <= r.recipients);
const failureResult = z.strictObject({
  kind: z.literal("failure"),
  error: safeError,
});
export const callbackResult = z.strictObject({
  ...api,
  type: z.literal("callback.result"),
  callbackId: z.string(),
  bindingId: z.string(),
  result: z.union([permissionResult, fileResult, failureResult]),
});
export const callbackCancel = z.strictObject({
  ...api,
  type: z.literal("callback.cancel"),
  callbackId: z.string(),
  reason: z.enum([
    "timeout",
    "input-canceled",
    "session-stopped",
    "client-disconnected",
    "daemon-shutdown",
  ]),
});
export const callbackFrames = z.union([
  bind,
  unbind,
  permissionRequest,
  fileRequest,
  callbackResult,
  callbackCancel,
]);
