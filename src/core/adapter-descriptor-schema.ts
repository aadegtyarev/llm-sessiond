import { z } from "zod";
import { STANDARD_CAPABILITIES } from "./adapter-contracts.js";

const name = z.string().regex(/^[a-z][a-z0-9._-]{0,127}$/);
const json: z.ZodTypeAny = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string(),
  z.array(json), z.record(z.string(), json),
]));
const operation = z.strictObject({ name, effect: z.enum(["read", "write"]), guardRequired: z.boolean() });
const extension = z.strictObject({ namespace: name, version: z.number().int().positive(), operations: z.array(operation), events: z.array(name) });
const option = z.strictObject({ key: name, label: z.string(), values: z.array(json), allowCustom: z.boolean().optional(), defaultValue: json.optional(), dangerousValues: z.array(json).optional() });
export const descriptorSchema = z.strictObject({
  id: name, aliases: z.array(name), capabilities: z.array(z.string()),
  metadata: z.record(name, z.string()).optional(), options: z.array(option).optional(),
  extensions: z.array(extension).optional(),
}).superRefine((descriptor, ctx) => {
  if (new Set(descriptor.capabilities).size !== descriptor.capabilities.length || new Set(descriptor.aliases).size !== descriptor.aliases.length) ctx.addIssue({ code: "custom", message: "duplicate descriptor value" });
  if (descriptor.options && new Set(descriptor.options.map((item) => item.key)).size !== descriptor.options.length) ctx.addIssue({ code: "custom", message: "duplicate option" });
  const known = new Set<string>(STANDARD_CAPABILITIES);
  for (const capability of descriptor.capabilities) {
    if (!known.has(capability) && !/^[a-z][a-z0-9.-]+\/[a-z][a-z0-9._-]*$/.test(capability)) {
      ctx.addIssue({ code: "custom", message: "invalid capability" });
    }
  }
  for (const ext of descriptor.extensions ?? []) {
    if (new Set(ext.operations.map((item) => item.name)).size !== ext.operations.length || new Set(ext.events).size !== ext.events.length) ctx.addIssue({ code: "custom", message: "duplicate extension member" });
  }
});
