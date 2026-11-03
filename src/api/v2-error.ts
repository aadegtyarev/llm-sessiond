import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { z } from "zod";
import { sendJson } from "./http-support.js";

const failureSchema = z.strictObject({
  reason: z.enum([
    "prompt_rejected",
    "hold_timeout",
    "held_and_stopped",
    "canceled",
  ]),
  text: z.string().optional(),
});
const safeErrorSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
  category: z.enum([
    "validation",
    "not-found",
    "unsupported",
    "conflict",
    "unavailable",
    "uncertain",
    "internal",
  ]),
  outcome: z.enum(["not-applied", "applied", "unknown"]),
  reference: z.string(),
  inputId: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/)
    .optional(),
  failure: failureSchema.optional(),
  resumed: z.literal(true).optional(),
  adapterError: z
    .strictObject({
      namespace: z.string(),
      version: z.number().int(),
      code: z.string(),
    })
    .optional(),
});
export function sendV2SessionError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
  category:
    | "validation"
    | "not-found"
    | "unsupported"
    | "conflict"
    | "unavailable"
    | "uncertain"
    | "internal",
  outcome: "not-applied" | "applied" | "unknown",
  input?: { inputId: string; resumed: boolean; failureReason?: string },
): void {
  sendJson(
    response,
    status,
    {
      code,
      message,
      category,
      outcome,
      reference: randomUUID(),
      ...(input ? { inputId: input.inputId } : {}),
      ...(input?.resumed ? { resumed: true } : {}),
      ...(input?.failureReason
        ? { failure: { reason: input.failureReason } }
        : {}),
    },
    safeErrorSchema,
  );
}
export function sendV2Error(response: ServerResponse, status: 404 | 503): void {
  const notFound = status === 404;
  sendJson(
    response,
    status,
    {
      code: notFound ? "NOT_FOUND" : "UNAVAILABLE",
      message: notFound ? "route not found" : "service unavailable",
      category: notFound ? "not-found" : "unavailable",
      outcome: "not-applied",
      reference: randomUUID(),
    },
    safeErrorSchema,
  );
}
