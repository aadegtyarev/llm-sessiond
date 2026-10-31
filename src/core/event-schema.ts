import { z } from "zod";

const status = z.enum([
  "starting",
  "running",
  "stopped",
  "failed",
  "uncertain",
]);
const failure = z.strictObject({
  code: z.enum([
    "PI_STARTUP_FAILED",
    "PI_RESUME_FAILED",
    "PI_PROCESS_EXITED",
    "PI_MALFORMED_JSON",
  ]),
  at: z.string().datetime(),
});
const activity = z.union([
  z.strictObject({
    type: z.enum([
      "agent_start",
      "agent_end",
      "agent_settled",
      "compaction_start",
      "compaction_end",
      "assistant_message_end",
    ]),
  }),
  z.strictObject({ type: z.literal("thinking"), active: z.boolean() }),
  z.strictObject({
    type: z.literal("tool_start"),
    toolCallId: z.string(),
    toolName: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("tool_end"),
    toolCallId: z.string(),
    toolName: z.string().optional(),
    failed: z.boolean().optional(),
  }),
]);
const base = {
  apiVersion: z.literal("v1"),
  eventId: z.number().int().positive(),
  sessionId: z.string().uuid(),
  at: z.string().datetime(),
};
export const eventEnvelopeSchema = z.union([
  z.strictObject({
    ...base,
    type: z.literal("session.status"),
    data: z.strictObject({ status, failure: failure.optional() }),
  }),
  z.strictObject({
    ...base,
    type: z.literal("input.state"),
    data: z.strictObject({
      inputId: z.string().uuid(),
      state: z.enum([
        "pending",
        "accepted",
        "completed",
        "failed",
        "uncertain",
      ]),
      reason: z.string().optional(),
    }),
  }),
  z.strictObject({
    ...base,
    type: z.literal("assistant.delta"),
    data: z.strictObject({ text: z.string() }),
  }),
  z.strictObject({
    ...base,
    type: z.literal("activity"),
    data: activity,
  }),
  z.strictObject({
    ...base,
    type: z.literal("notification"),
    data: z.strictObject({ text: z.string() }),
  }),
  z.strictObject({
    ...base,
    type: z.literal("session.error"),
    data: z.strictObject({ code: z.literal("PI_MALFORMED_JSON") }),
  }),
  z.strictObject({
    ...base,
    type: z.literal("turn.completed"),
    data: z.strictObject({}),
  }),
]);
