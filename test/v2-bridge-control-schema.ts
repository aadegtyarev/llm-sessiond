import { z } from "zod";
import {
  v2ControlCancelSchema as cancel,
  v2ControlRequestSchema as controlRequest,
} from "../src/api/v2-bridge-inbound-schema.js";
export { cancel, controlRequest };

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
export const cancelResult = z.strictObject({
  outcome: z.enum(["not-dispatched", "unknown"]),
});
export const controlFrames = z.union([controlRequest, cancel]);
