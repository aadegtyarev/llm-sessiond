import { access } from "node:fs/promises";
import { ProcessCleanupUnconfirmed } from "./v2-smoke-child.mjs";

export async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
export async function requireAbsent(file) {
  if (await exists(file)) throw new ProcessCleanupUnconfirmed();
}
