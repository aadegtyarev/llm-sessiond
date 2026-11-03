import type { ImageInput } from "../interfaces/runtime-ports.js";
import { copySafeJson } from "./safe-json.js";

export function validateImages(images?: ImageInput[]): ImageInput[] {
  if (images === undefined) return [];
  let safe: unknown;
  try {
    safe = copySafeJson(images, 24 * 1024 * 1024, 3);
  } catch {
    throw new Error("Invalid images");
  }
  if (!Array.isArray(safe)) throw new Error("Invalid images");
  let total = 0;
  for (const image of safe) {
    if (
      !image ||
      typeof image !== "object" ||
      Array.isArray(image) ||
      typeof image.mimeType !== "string" ||
      typeof image.data !== "string" ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        image.data,
      )
    )
      throw new Error("Invalid images");
    const bytes = Buffer.from(image.data, "base64");
    if (bytes.toString("base64") !== image.data)
      throw new Error("Invalid images");
    total += bytes.length;
    if (total > 20 * 1024 * 1024) throw new Error("Input too large");
  }
  return safe as ImageInput[];
}
