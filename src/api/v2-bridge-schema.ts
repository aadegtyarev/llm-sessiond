import { z } from "zod";
import { v2SessionSchema } from "./v2-session-schema.js";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
export const v2OpenSchema = z.strictObject({
  apiVersion: z.literal("v2"),
  type: z.literal("client.open"),
  requestId: z.string().min(1),
  protocolRevision: z.literal(1),
  callbacks: z.array(z.enum(["tool.permission", "agent.file.send"])),
});
export const v2LiveEventSchema = z.strictObject({
  apiVersion: z.literal("v2"),
  type: z.literal("event"),
  instanceId: z.string(),
  sequence: z.number().int().positive().safe(),
  at: z.string(),
  event: z.union([
    z.strictObject({
      kind: z.literal("session.changed"),
      session: v2SessionSchema,
    }),
    z.strictObject({ kind: z.literal("session.deleted"), sessionId: id }),
    z.strictObject({
      kind: z.literal("harness.event"),
      sessionId: id,
      event: z.union([
        z.strictObject({ kind: z.literal("output"), text: z.string() }),
        z.strictObject({
          kind: z.literal("input"),
          inputEvent: z.strictObject({
            inputId: id,
            state: z.enum([
              "pending",
              "accepted",
              "completed",
              "failed",
              "uncertain",
            ]),
            failure: z
              .strictObject({
                reason: z.enum([
                  "prompt_rejected",
                  "hold_timeout",
                  "held_and_stopped",
                  "canceled",
                ]),
              })
              .optional(),
          }),
        }),
      ]),
    }),
  ]),
});
