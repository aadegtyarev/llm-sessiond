import { ControlPlaneError } from "./control-plane-error.js";

export interface InputImage {
  mimeType: string;
  data: string;
}
export interface ValidatedInput {
  text: string;
  images?: InputImage[];
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
      typeof item.data !== "string" ||
      item.data.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        item.data,
      )
    )
      throw new ControlPlaneError("INVALID_INPUT");
    const decoded = Buffer.from(item.data, "base64");
    if (decoded.toString("base64") !== item.data)
      throw new ControlPlaneError("INVALID_INPUT");
    bytes += decoded.byteLength;
    if (bytes > 20 * 1024 * 1024) throw new ControlPlaneError("INVALID_INPUT");
    return { mimeType: item.mimeType, data: item.data };
  });
  return { text: row.text, images };
}
