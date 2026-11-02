import path from "node:path";
import {
  ProcessCleanupUnconfirmed,
  confirmStopped,
  spawnChild,
  stopChild,
  waitChild,
} from "./v2-smoke-child.mjs";
import { exists, requireAbsent } from "./v2-smoke-files.mjs";
import { waitReady } from "./v2-smoke-readiness.mjs";

export async function startV2(root, env) {
  const child = spawnChild(
    process.execPath,
    [path.join(root, "dist/main-v2.js")],
    {
      env,
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  try {
    const base = await waitReady(child);
    return { child, base };
  } catch {
    await confirmStopped(child);
    if (
      env.LLM_SESSIOND_STATE_DIR &&
      (await exists(path.join(env.LLM_SESSIOND_STATE_DIR, "owner.lock")))
    )
      throw new ProcessCleanupUnconfirmed();
    throw new Error("v2 process did not become ready");
  }
}
export async function exitCode(child) {
  const result = await waitChild(child, 5000);
  if (!result) {
    await confirmStopped(child);
    throw new Error("child exit timed out");
  }
  if (result.error || result.signal)
    throw new Error("child did not exit normally");
  return result.code ?? -1;
}
export function stopV2(child) {
  return stopChild(child);
}
export async function signalDuringStartup(root, env, stateDir) {
  const child = spawnChild(
    process.execPath,
    [path.join(root, "dist/main-v2.js")],
    {
      env: { ...env, LLM_SESSIOND_STATE_DIR: stateDir },
      stdio: "ignore",
    },
  );
  const lock = path.join(stateDir, "owner.lock", "owner.json");
  try {
    for (let count = 0; count < 500; count++) {
      if (await exists(lock)) {
        child.kill("SIGTERM");
        child.kill("SIGINT");
        const result = await waitChild(child, 8000);
        if (!result) await confirmStopped(child);
        if (result?.code !== 0 || result.signal) throw Error();
        await requireAbsent(lock);
        return;
      }
      if (await waitChild(child, 0)) throw Error();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw Error();
  } catch {
    const result = await confirmStopped(child);
    if (result && (await exists(lock))) throw new ProcessCleanupUnconfirmed();
    throw Error("startup signal fixture failed");
  }
}
