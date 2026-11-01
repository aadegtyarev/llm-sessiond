import { stat } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "./api-error.js";

export async function assertValidCwd(cwd: string): Promise<void> {
  if (!path.isAbsolute(cwd))
    throw new ApiError(400, "INVALID_CWD", "cwd must be absolute");
  try {
    if (!(await stat(cwd)).isDirectory()) throw new Error();
  } catch {
    throw new ApiError(400, "INVALID_CWD", "cwd must be an existing directory");
  }
}
