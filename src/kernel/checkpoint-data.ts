import type { SessionRecord } from "../interfaces/runtime-ports.js";
import { copySafeJson } from "./safe-json.js";

export function cleanCheckpoint(
  value: NonNullable<SessionRecord["checkpoint"]>,
): NonNullable<SessionRecord["checkpoint"]> {
  try {
    if (
      !/^[a-z][a-z0-9._-]{0,63}$/.test(value.namespace) ||
      !Number.isSafeInteger(value.version) ||
      value.version < 1
    )
      throw new Error();
    return {
      namespace: value.namespace,
      version: value.version,
      data: copySafeJson(value.data, 65536, 32),
    };
  } catch {
    throw new Error("Invalid checkpoint");
  }
}
