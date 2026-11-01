import { z } from "zod";
import { session, sessionId } from "./v2-schema-common.js";
import { harnessEvent } from "./v2-harness-event-schema.js";
const eventData = z.union([
  z.strictObject({ kind: z.literal("session.changed"), session }),
  z.strictObject({ kind: z.literal("session.deleted"), sessionId }),
  z.strictObject({
    kind: z.literal("harness.event"),
    sessionId,
    event: harnessEvent,
  }),
  z.strictObject({
    kind: z.literal("extension"),
    namespace: z.string(),
    version: z.number().int().positive(),
    name: z.string(),
    data: z.unknown(),
  }),
]);
export const liveEvent = z.strictObject({
  apiVersion: z.literal("v2"),
  type: z.literal("event"),
  instanceId: z.string(),
  sequence: z.number().int().positive().safe(),
  at: z.string(),
  event: eventData,
});
export const snapshotFrame = z.discriminatedUnion("type", [
  z.strictObject({
    apiVersion: z.literal("v2"),
    type: z.literal("snapshot.begin"),
    snapshotId: z.string(),
    afterSequence: z.number().int().nonnegative().safe(),
  }),
  z.strictObject({
    apiVersion: z.literal("v2"),
    type: z.literal("snapshot.session"),
    snapshotId: z.string(),
    session,
  }),
  z.strictObject({
    apiVersion: z.literal("v2"),
    type: z.literal("snapshot.end"),
    snapshotId: z.string(),
  }),
]);
