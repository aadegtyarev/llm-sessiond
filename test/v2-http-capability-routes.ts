import { z } from "zod";
import {
  commands,
  catalog,
  efforts,
  model,
  noBody,
  options,
  spec,
  status,
} from "./v2-http-common-schema.js";
import { sessionResponse } from "./v2-schema-common.js";

export const capabilityRoutes = [
  spec("GET", /^\/sessions\/[^/]+\/status$/, 200, noBody, status),
  spec("GET", /^\/sessions\/[^/]+\/models$/, 200, noBody, catalog),
  spec(
    "POST",
    /^\/sessions\/[^/]+\/model$/,
    200,
    z.strictObject({
      provider: z.string(),
      modelId: z.string(),
      effort: z.string().optional(),
    }),
    z.strictObject({
      model: model,
      effort: z.string().optional(),
      effortConfirmed: z.boolean().optional(),
    }),
  ),
  spec("GET", /^\/sessions\/[^/]+\/efforts$/, 200, noBody, efforts),
  spec(
    "POST",
    /^\/sessions\/[^/]+\/effort$/,
    204,
    z.strictObject({ level: z.string() }),
    z.null(),
  ),
  spec("GET", /^\/sessions\/[^/]+\/options$/, 200, noBody, options),
  spec(
    "PATCH",
    /^\/sessions\/[^/]+\/options$/,
    200,
    z.strictObject({
      set: z.record(z.string(), z.unknown()).optional(),
      resetKeys: z.array(z.string()).optional(),
      confirmedDangerous: z.boolean().optional(),
    }),
    sessionResponse,
  ),
  spec("GET", /^\/sessions\/[^/]+\/commands$/, 200, noBody, commands),
  spec(
    "POST",
    /^\/sessions\/[^/]+\/extensions\/[^/]+\/[^/]+$/,
    200,
    z.strictObject({ version: z.number().int(), input: z.unknown() }),
    z.strictObject({ version: z.number().int(), output: z.unknown() }),
  ),
];
