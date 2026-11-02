import { access } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import {
  ProcessCleanupUnconfirmed,
  confirmStopped,
  spawnChild,
  waitChild,
} from "./v2-smoke-child.mjs";
import { exists, requireAbsent } from "./v2-smoke-files.mjs";

export async function bindFailure(root, env, stateDir) {
  const holder = createServer();
  let child;
  try {
    await new Promise((resolve, reject) => {
      holder.once("error", reject);
      holder.listen(0, "127.0.0.1", resolve);
    });
    const address = holder.address();
    child = spawnChild(process.execPath, [path.join(root, "dist/main-v2.js")], {
      env: {
        ...env,
        PORT: String(address.port),
        LLM_SESSIOND_STATE_DIR: stateDir,
      },
      stdio: "ignore",
    });
    const result = await waitChild(child, 8000);
    if (!result) throw new ProcessCleanupUnconfirmed();
    if (result.error || result.signal || result.code !== 1) throw Error();
    await access(path.join(stateDir, "sessions.sqlite3"));
    await requireAbsent(path.join(stateDir, "owner.lock"));
  } catch {
    if (child) {
      const result = await confirmStopped(child);
      if (result && (await exists(path.join(stateDir, "owner.lock"))))
        throw new ProcessCleanupUnconfirmed();
    }
    throw Error("bind failure fixture failed");
  } finally {
    try {
      if (child && !(await waitChild(child, 0))) await confirmStopped(child);
    } finally {
      if (holder.listening)
        await new Promise((resolve) => holder.close(resolve));
    }
  }
}
