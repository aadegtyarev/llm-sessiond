import { stat } from "node:fs/promises";
import path from "node:path";
import { ControlPlaneError } from "./control-plane-error.js";
export async function validateLifecycleCwd(cwd: string): Promise<void> {
  if (!path.isAbsolute(cwd)) throw new ControlPlaneError("INVALID_CWD");
  try {
    if (!(await stat(cwd)).isDirectory())
      throw new ControlPlaneError("INVALID_CWD");
  } catch {
    throw new ControlPlaneError("INVALID_CWD");
  }
}
