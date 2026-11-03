import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { DurableSessionManager } from "../core/durable-session-manager.js";
import { parseBody, readBody, sendJson } from "./http-support.js";
import {
  matchesInstance,
  sendSessionError,
} from "./v2-session-http-support.js";
import { isPayloadTooLarge } from "./v2-session-error-facts.js";
import { sendInputError } from "./v2-input-errors.js";

const inputSchema = z.strictObject({
  text: z.string().refine((text) => Buffer.byteLength(text, "utf8") <= 262144),
});

export async function submitV2Input(
  manager: DurableSessionManager,
  instanceId: string,
  sessionId: string,
  request: IncomingMessage,
  response: ServerResponse,
  assertReady: () => void,
): Promise<void> {
  let body: z.infer<typeof inputSchema>;
  try {
    body = parseBody(inputSchema, await readBody(request));
  } catch (error) {
    const large = isPayloadTooLarge(error);
    sendSessionError(
      response,
      large ? 413 : 400,
      large ? "LIMIT_EXCEEDED" : "VALIDATION_ERROR",
      large ? "request body too large" : "request does not match schema",
      "validation",
      "not-applied",
    );
    return;
  }
  if (!matchesInstance(request, instanceId)) {
    sendSessionError(
      response,
      503,
      "INSTANCE_CHANGED",
      "service instance changed",
      "unavailable",
      "not-applied",
    );
    return;
  }
  try {
    assertReady();
  } catch {
    sendSessionError(
      response,
      503,
      "UNAVAILABLE",
      "service unavailable",
      "unavailable",
      "not-applied",
    );
    return;
  }
  let submitted: { inputId: string; resumed: boolean } | undefined;
  try {
    submitted = await manager.inputs.submit(sessionId, body);
    assertReady();
    sendJson(
      response,
      202,
      submitted,
      z.strictObject({ inputId: z.string(), resumed: z.boolean() }),
    );
  } catch (error) {
    sendInputError(response, error, submitted);
  }
}
