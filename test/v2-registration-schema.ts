import { z } from "zod";

const json: z.ZodTypeAny = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number(),
    z.boolean(),
    z.array(json),
    z.record(z.string(), json),
  ]),
);
export const descriptor = z.strictObject({
  id: z.string().min(1),
  aliases: z.array(z.string()),
  capabilities: z.array(z.string()),
  metadata: z.record(z.string(), z.string()).optional(),
  options: z
    .array(
      z.strictObject({
        key: z.string(),
        label: z.string(),
        values: z.array(json),
        allowCustom: z.boolean().optional(),
        defaultValue: json.optional(),
        dangerousValues: z.array(json).optional(),
      }),
    )
    .optional(),
  extensions: z
    .array(
      z.strictObject({
        namespace: z.string().min(1),
        version: z.number().int().positive(),
        operations: z.array(
          z.strictObject({
            name: z.string(),
            effect: z.enum(["read", "write"]),
            guardRequired: z.boolean(),
          }),
        ),
        events: z.array(z.string()),
      }),
    )
    .optional(),
});
const checkpoint = z.strictObject({
  namespace: z.string(),
  version: z.number().int().positive(),
  data: json,
});
const sample = z.strictObject({
  namespace: z.string(),
  version: z.number().int().positive(),
  operation: z.string(),
  input: json,
  output: json,
  event: z.strictObject({ name: z.string(), data: json }),
});
export const registration = z.strictObject({ descriptor, checkpoint, sample });
export function validateRegistration(value: unknown): boolean {
  const parsed = registration.safeParse(value);
  if (!parsed.success) return false;
  const { descriptor: d, checkpoint: c, sample: s } = parsed.data;
  const ext = d.extensions?.find(
    (e) => e.namespace === s.namespace && e.version === s.version,
  );
  return (
    !!ext &&
    c.namespace === ext.namespace &&
    c.version > 0 &&
    Buffer.byteLength(JSON.stringify(c.data)) <= 65536 &&
    ext.operations.some((o) => o.name === s.operation) &&
    ext.events.includes(s.event.name)
  );
}
