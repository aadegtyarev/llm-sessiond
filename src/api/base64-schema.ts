import { z } from "zod";

const standardBase64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
export const canonicalBase64Schema = z
  .string()
  .min(4)
  .refine(
    (value) =>
      standardBase64.test(value) &&
      Buffer.from(value, "base64").toString("base64") === value,
  );
