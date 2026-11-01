import { z } from "zod";

const inputFailure = z.strictObject({
  reason: z.enum([
    "prompt_rejected",
    "hold_timeout",
    "held_and_stopped",
    "canceled",
  ]),
  text: z.string().optional(),
});
const inputEvent = z.strictObject({
  inputId: z.string(),
  state: z.enum(["pending", "accepted", "completed", "failed", "uncertain"]),
  detail: z.string().optional(),
  failure: inputFailure.optional(),
});
const stop = z.strictObject({
  reason: z.enum([
    "process_exited",
    "stream_corrupted",
    "stdout_not_closed",
    "stdout_closed_early",
    "channel_failed",
    "event_stream_failed",
  ]),
  exit: z.string().optional(),
  channel: z.enum(["stdin", "stdout", "stderr"]).optional(),
});
const activity = z.union([
  z.strictObject({ type: z.literal("thinking"), active: z.boolean() }),
  z.strictObject({
    type: z.literal("tool_start"),
    toolCallId: z.string(),
    summary: z.string(),
  }),
  z.strictObject({
    type: z.literal("tool_end"),
    toolCallId: z.string(),
    failed: z.boolean().optional(),
    detail: z.string().optional(),
  }),
  z.strictObject({ type: z.literal("thought"), text: z.string() }),
  z.strictObject({
    type: z.literal("task"),
    goal: z.string(),
    progress: z.string().optional(),
    status: z.string(),
    step: z.number().int(),
    limit: z.number().int().optional(),
  }),
  z.strictObject({ type: z.literal("agent_notice"), text: z.string() }),
  z.strictObject({
    type: z.literal("notification"),
    text: z.string(),
    level: z.string().optional(),
    widgetKey: z.string().optional(),
  }),
]);
const anomaly = z.strictObject({
  kind: z.string(),
  action: z.string(),
  ref: z.string(),
  running: z.boolean(),
  stopRequested: z.boolean().optional(),
  recordType: z.string().optional(),
  command: z.string().optional(),
  bytes: z.number().int().nonnegative().optional(),
  detail: z.string().optional(),
});
export const harnessEvent = z.union([
  z.strictObject({ kind: z.enum(["output", "status"]), text: z.string() }),
  z.strictObject({
    kind: z.literal("error"),
    text: z.string(),
    fatal: z.boolean().optional(),
    stop: stop.optional(),
  }),
  z.strictObject({ kind: z.literal("input"), inputEvent }),
  z.strictObject({ kind: z.literal("activity"), activityEvent: activity }),
  z.strictObject({ kind: z.literal("anomaly"), anomalyEvent: anomaly }),
]);
