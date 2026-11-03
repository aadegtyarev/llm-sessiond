import { z } from "zod";
import { safeError, sessionId } from "./v2-schema-common.js";
import {
  v2BridgeCorrelation as correlation,
  v2CallbackBindSchema as bind,
  v2CallbackUnbindSchema as unbind,
  v2GuardSetSchema as guardSet,
} from "../src/api/v2-bridge-inbound-schema.js";

const api = { apiVersion: z.literal("v2") };
export { correlation, bind, unbind, guardSet };
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
export const guardAck = z.strictObject({
  contextId: z.string(),
  generation: z.number().int().nonnegative(),
  sessionId: sessionId.nullable(),
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
