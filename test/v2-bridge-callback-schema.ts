import { z } from "zod";
import { sessionId } from "./v2-schema-common.js";
import { v2CallbackResultSchema as callbackResult } from "../src/api/v2-bridge-inbound-schema.js";
export { callbackResult };
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
