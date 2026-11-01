import { chmod, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SafeValidationError } from "../core/generic-json.js";

export function resolveStateDirectory(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  const selected = env.LLM_SESSIOND_STATE_DIR || (env.XDG_STATE_HOME && path.join(env.XDG_STATE_HOME, "llm-sessiond")) || path.join(os.homedir(), ".local", "state", "llm-sessiond");
  if (platform === "win32") {
    const win = path.win32;
    if (!win.isAbsolute(selected) || !(/^[A-Za-z]:\\/.test(selected) || /^\\\\[^\\]+\\[^\\]+/.test(selected))) throw new SafeValidationError("INVALID_STATE_DIRECTORY");
    return win.normalize(selected);
  }
  if (!path.isAbsolute(selected)) throw new SafeValidationError("INVALID_STATE_DIRECTORY");
  return path.resolve(selected);
}
export async function prepareStateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(directory, 0o700).catch(() => undefined);
}
