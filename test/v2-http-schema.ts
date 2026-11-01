import { z } from "zod";
import { safeError } from "./v2-schema-common.js";
import { capabilityRoutes } from "./v2-http-capability-routes.js";
import { sessionRoutes } from "./v2-http-session-routes.js";

const routes = [...sessionRoutes, ...capabilityRoutes];
export function validateHttp(row: unknown): boolean {
  return routes.some(
    (r) =>
      Array.isArray(row) &&
      row.length === 5 &&
      row[0] === r.method &&
      typeof row[1] === "string" &&
      r.path.test(row[1]) &&
      row[2] === r.code &&
      r.request.safeParse(row[3]).success &&
      r.response.safeParse(row[4]).success,
  );
}
export function validateSafeError(statusCode: number, value: unknown): boolean {
  return statusCode === 409 && safeError.safeParse(value).success;
}
export function validateUnsupported(value: unknown): boolean {
  const schema = z.strictObject({
    method: z.literal("POST"),
    path: z
      .string()
      .regex(new RegExp("^/sessions/[^/]+/extensions/[^/]+/[^/]+$")),
    request: z.strictObject({
      version: z.number().int().positive(),
      input: z.unknown(),
    }),
    status: z.literal(409),
    error: safeError.refine(
      (e) => e.category === "unsupported" && e.outcome === "not-applied",
    ),
  });
  return schema.safeParse(value).success;
}
