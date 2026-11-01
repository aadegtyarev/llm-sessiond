import { z } from "zod";
import { sessionId } from "./v2-schema-common.js";
import { correlation } from "./v2-bridge-handshake-schema.js";

const guard = z.strictObject({
  contextId: z.string().min(1),
  generation: z.number().int().nonnegative(),
});
const common = {
  ...correlation,
  type: z.literal("control.request"),
  sessionId,
  guard,
  timeoutMs: z.number().int().positive(),
};
export const controlRequest = z.union([
  z.strictObject({ ...common, operation: z.literal("reload") }),
  z.strictObject({
    ...common,
    operation: z.literal("command.run"),
    name: z.string(),
    remainder: z.string(),
  }),
  z.strictObject({
    ...common,
    operation: z.literal("extension"),
    namespace: z.string(),
    version: z.number().int().positive(),
    name: z.string(),
    input: z.unknown(),
  }),
]);
export const controlResults = {
  reload: z.strictObject({ reloaded: z.literal(true) }),
  command: z.strictObject({
    disposition: z.enum(["handled", "accepted"]),
    output: z.string().optional(),
  }),
  extension: z.strictObject({
    version: z.number().int().positive(),
    output: z.unknown(),
  }),
};
export const cancel = z.strictObject({
  ...correlation,
  type: z.literal("control.cancel"),
  targetRequestId: z.string().min(1),
});
export const cancelResult = z.strictObject({
  outcome: z.enum(["not-dispatched", "unknown"]),
});
export const controlFrames = z.union([controlRequest, cancel]);
