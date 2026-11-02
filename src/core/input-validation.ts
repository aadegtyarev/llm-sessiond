import { ControlPlaneError } from "./control-plane-error.js";

export interface InputImage {
  mimeType: string;
  data: string;
}
export interface ValidatedInput {
  text: string;
  images?: InputImage[];
}
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
function hasBase64Alphabet(data: string, padding: number): boolean {
  for (let index = 0; index < data.length - padding; index++) {
    const code = data.charCodeAt(index);
    if (
      !(code >= 65 && code <= 90) &&
      !(code >= 97 && code <= 122) &&
      !(code >= 48 && code <= 57) &&
      code !== 43 &&
      code !== 47
    )
      return false;
  }
  return true;
}
export function validateInput(value: unknown): ValidatedInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ControlPlaneError("INVALID_INPUT");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).some((key) => key !== "text" && key !== "images") ||
    typeof row.text !== "string" ||
    Buffer.byteLength(row.text, "utf8") > 262144
  )
    throw new ControlPlaneError("INVALID_INPUT");
  if (row.images === undefined) return { text: row.text };
  if (!Array.isArray(row.images)) throw new ControlPlaneError("INVALID_INPUT");
  let bytes = 0;
  const images = row.images.map((image): InputImage => {
    if (!image || typeof image !== "object" || Array.isArray(image))
      throw new ControlPlaneError("INVALID_INPUT");
    const item = image as Record<string, unknown>;
    if (
      Object.keys(item).sort().join(",") !== "data,mimeType" ||
      typeof item.mimeType !== "string" ||
      typeof item.data !== "string"
    )
      throw new ControlPlaneError("INVALID_INPUT");
    const padding = item.data.endsWith("==")
      ? 2
      : item.data.endsWith("=")
        ? 1
        : 0;
    const decodedLength = (item.data.length / 4) * 3 - padding;
    if (
      item.data.length % 4 !== 0 ||
      decodedLength > MAX_IMAGE_BYTES - bytes ||
      !hasBase64Alphabet(item.data, padding)
    )
      throw new ControlPlaneError("INVALID_INPUT");
    const decoded = Buffer.from(item.data, "base64");
    if (
      decoded.byteLength !== decodedLength ||
      decoded.toString("base64") !== item.data
    )
      throw new ControlPlaneError("INVALID_INPUT");
    bytes += decodedLength;
    return { mimeType: item.mimeType, data: item.data };
  });
  return { text: row.text, images };
}
