import { z } from "zod";
import { session, sessionResponse } from "./v2-schema-common.js";

export const model = z.strictObject({
  provider: z.string(),
  id: z.string(),
  name: z.string(),
});
export const noBody = z.null();
export const spec = (
  method: string,
  path: RegExp,
  code: number,
  request: z.ZodTypeAny,
  response: z.ZodTypeAny,
) => ({ method, path, code, request, response });

export const usage = z.strictObject({
  totalTokens: z.number().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  cacheReadTokens: z.number().optional(),
  cacheWriteTokens: z.number().optional(),
  costUsd: z.number().optional(),
  contextTokens: z.number().nullable().optional(),
  contextWindow: z.number().optional(),
  contextPercent: z.number().nullable().optional(),
});
export const status = z.strictObject({
  session,
  live: z
    .strictObject({
      model: model.optional(),
      effort: z.string().optional(),
      usage: usage.optional(),
    })
    .optional(),
});
export const sessionBody = z.strictObject({
  cwd: z.string(),
  harnessId: z.string().optional(),
  name: z.string().optional(),
  adapterOptions: z.record(z.string(), z.unknown()).optional(),
  confirmedDangerousOptions: z.array(z.string()).optional(),
  callbackConnectionId: z.string().optional(),
});
export const inputBody = z.strictObject({
  text: z.string(),
  images: z
    .array(z.strictObject({ mimeType: z.string(), data: z.string() }))
    .optional(),
});
export const options = z.strictObject({
  descriptors: z.array(
    z.strictObject({
      key: z.string(),
      label: z.string(),
      values: z.array(z.unknown()),
      allowCustom: z.boolean().optional(),
      defaultValue: z.unknown().optional(),
      dangerousValues: z.array(z.unknown()).optional(),
    }),
  ),
  defaults: z.record(z.string(), z.unknown()).optional(),
  overrides: z.record(z.string(), z.unknown()).optional(),
  effective: z.record(z.string(), z.unknown()).optional(),
});
export const commands = z.strictObject({
  commands: z.array(
    z.strictObject({ name: z.string(), description: z.string() }),
  ),
});
export const catalog = z.strictObject({
  models: z.array(model),
  current: model.optional(),
});
export const efforts = z.strictObject({
  levels: z.array(z.string()),
  current: z.string().optional(),
});
export const sessionResponseSchema = sessionResponse;
