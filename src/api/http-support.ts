import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { ApiError } from "../core/api-error.js";
import type { SessionRecord, SessionSummary } from "../core/types.js";

export const BODY_LIMIT = 24 * 1024 * 1024;
export function sendJson(
  response: ServerResponse,
  status: number,
  value?: unknown,
  schema?: z.ZodType,
): void {
  if (schema && value !== undefined) schema.parse(value);
  response.statusCode = status;
  if (value === undefined) {
    response.end();
    return;
  }
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(value));
}
export async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > BODY_LIMIT)
      throw new ApiError(413, "LIMIT_EXCEEDED", "request body too large");
    chunks.push(buffer);
  }
  if (!bytes) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "invalid JSON body");
  }
}
export function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "request does not match schema",
    );
  return result.data;
}
export function sessionSummary(record: SessionRecord): SessionSummary {
  return {
    id: record.id,
    ...(record.name ? { name: record.name } : {}),
    harnessId: record.harnessId,
    cwd: record.cwd,
    status: record.status,
    ...(record.nativeSessionId
      ? { nativeSessionId: record.nativeSessionId }
      : {}),
    ...(record.failure ? { failure: record.failure } : {}),
  };
}
