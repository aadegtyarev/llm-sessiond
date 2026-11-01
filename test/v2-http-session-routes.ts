import { z } from "zod";
import { descriptor } from "./v2-registration-schema.js";
import {
  inputBody,
  noBody,
  sessionBody,
  sessionResponseSchema,
  spec,
} from "./v2-http-common-schema.js";
import { empty, session } from "./v2-schema-common.js";

export const sessionRoutes = [
  spec(
    "GET",
    /^\/health$/,
    200,
    noBody,
    z.strictObject({
      apiVersion: z.literal("v2"),
      protocolRevision: z.literal(1),
      status: z.literal("ready"),
      serviceVersion: z.string(),
      instanceId: z.string(),
      supportedApiVersions: z.tuple([z.literal("v1"), z.literal("v2")]),
      features: z.array(z.string()),
    }),
  ),
  spec(
    "GET",
    /^\/harnesses$/,
    200,
    noBody,
    z.strictObject({
      defaultHarnessId: z.string(),
      harnesses: z.array(descriptor),
    }),
  ),
  spec(
    "GET",
    /^\/sessions$/,
    200,
    noBody,
    z.strictObject({ sessions: z.array(session) }),
  ),
  spec(
    "POST",
    /^\/sessions$/,
    201,
    sessionBody,
    z.strictObject({ session, bindingId: z.string().optional() }),
  ),
  spec("GET", /^\/sessions\/[^/]+$/, 200, noBody, sessionResponseSchema),
  spec(
    "PATCH",
    /^\/sessions\/[^/]+$/,
    200,
    z.strictObject({ name: z.string().nullable() }),
    sessionResponseSchema,
  ),
  spec("DELETE", /^\/sessions\/[^/]+$/, 204, noBody, z.null()),
  spec("POST", /^\/sessions\/[^/]+\/stop$/, 204, empty, z.null()),
  spec(
    "POST",
    /^\/sessions\/[^/]+\/resume$/,
    200,
    empty,
    sessionResponseSchema,
  ),
  spec(
    "POST",
    /^\/sessions\/[^/]+\/inputs$/,
    202,
    inputBody,
    z.strictObject({ inputId: z.string(), resumed: z.boolean() }),
  ),
  spec(
    "POST",
    /^\/sessions\/[^/]+\/inputs\/[^/]+\/cancel$/,
    204,
    empty,
    z.null(),
  ),
  spec("POST", /^\/sessions\/[^/]+\/cancel-current$/, 204, empty, z.null()),
];
