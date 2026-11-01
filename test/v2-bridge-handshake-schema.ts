import { z } from "zod";
import { safeError, sessionId } from "./v2-schema-common.js";

const api = { apiVersion: z.literal("v2") };
export const correlation = { ...api, requestId: z.string().min(1) };
export const hello = z.strictObject({
  ...api,
  type: z.literal("server.hello"),
  protocolRevision: z.literal(1),
  instanceId: z.string(),
  connectionId: z.string(),
});
export const open = z.strictObject({
  ...correlation,
  type: z.literal("client.open"),
  protocolRevision: z.literal(1),
  callbacks: z.array(z.enum(["tool.permission", "agent.file.send"])),
});
export const openAck = z.strictObject({
  protocolRevision: z.literal(1),
  instanceId: z.string(),
  connectionId: z.string(),
});
export const succeeded = z.strictObject({
  ...api,
  type: z.literal("request.succeeded"),
  requestId: z.string(),
  result: z.unknown(),
});
export const failed = z.strictObject({
  ...api,
  type: z.literal("request.failed"),
  requestId: z.string(),
  error: safeError,
});
export const guardSet = z.strictObject({
  ...correlation,
  type: z.literal("guard.set"),
  contextId: z.string(),
  generation: z.number().int().nonnegative(),
  sessionId: sessionId.nullable(),
});
export const guardAck = z.strictObject({
  contextId: z.string(),
  generation: z.number().int().nonnegative(),
  sessionId: sessionId.nullable(),
});
export const bind = z.strictObject({
  ...correlation,
  type: z.literal("callback.bind"),
  sessionId,
});
export const unbind = z.strictObject({
  ...correlation,
  type: z.literal("callback.unbind"),
  bindingId: z.string(),
});
export const connectionFrames = z.union([
  hello,
  open,
  succeeded,
  failed,
  guardSet,
  bind,
  unbind,
]);
