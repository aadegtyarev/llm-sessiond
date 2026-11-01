import { z } from "zod";

export const permissionPayload = z
  .strictObject({
    toolName: z.string().max(128),
    input: z.record(z.string(), z.unknown()),
    context: z.strictObject({
      suggestions: z.array(z.unknown()).max(8).optional(),
      toolUseId: z.string().max(512).optional(),
      agentId: z.string().max(512).optional(),
      blockedPath: z.string().max(512).optional(),
      decisionReason: z.string().max(512).optional(),
      title: z.string().max(512).optional(),
      displayName: z.string().max(512).optional(),
      description: z.string().max(512).optional(),
    }),
  })
  .refine((p) => Buffer.byteLength(JSON.stringify(p.input)) <= 32768);
export const filePayload = z
  .strictObject({
    path: z
      .string()
      .max(4096)
      .refine((s) => !s.includes("\0")),
    caption: z.string().optional(),
  })
  .refine((p) => !p.caption || Array.from(p.caption).length <= 1024);
