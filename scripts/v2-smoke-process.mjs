import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

export async function startV2(root, env) {
  const child = spawn(process.execPath, [path.join(root, "dist/main-v2.js")], {
    env,
    stdio: ["ignore", "pipe", "ignore"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-2048);
  });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error()), 10000);
    child.once("error", () => {
      clearTimeout(timer);
      reject(Error());
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(Error());
    });
    child.stdout.on("data", () => {
      const match = output.match(/listening on 127\.0\.0\.1:(\d+)/);
      if (!match) return;
      clearTimeout(timer);
      resolve(`http://127.0.0.1:${match[1]}/api/v2`);
    });
  });
  return { child, base };
}
export function exitCode(child) {
  return new Promise((resolve) =>
    child.once("exit", (code) => resolve(code ?? 1)),
  );
}
export async function stopV2(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const code = await Promise.race([
    exitCode(child),
    new Promise((_, reject) => setTimeout(() => reject(Error()), 8000)),
  ]);
  if (code !== 0) throw Error();
}
export async function signalDuringStartup(root, env, stateDir) {
  const child = spawn(process.execPath, [path.join(root, "dist/main-v2.js")], {
    env: { ...env, LLM_SESSIOND_STATE_DIR: stateDir },
    stdio: "ignore",
  });
  const lock = path.join(stateDir, "owner.lock", "owner.json");
  for (let count = 0; count < 500; count++) {
    try {
      await access(lock);
      child.kill("SIGTERM");
      child.kill("SIGINT");
      if ((await exitCode(child)) !== 0) throw Error();
      await access(lock).then(
        () => {
          throw Error();
        },
        () => {},
      );
      return;
    } catch {
      if (child.exitCode !== null) throw Error();
      if (count === 499) throw Error();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}
export async function bindFailure(root, env, stateDir) {
  const holder = createServer();
  await new Promise((resolve) => holder.listen(0, "127.0.0.1", resolve));
  const address = holder.address();
  const child = spawn(process.execPath, [path.join(root, "dist/main-v2.js")], {
    env: {
      ...env,
      PORT: String(address.port),
      LLM_SESSIOND_STATE_DIR: stateDir,
    },
    stdio: "ignore",
  });
  if ((await exitCode(child)) === 0) throw Error();
  await new Promise((resolve) => holder.close(resolve));
  await access(path.join(stateDir, "owner.lock")).then(
    () => {
      throw Error();
    },
    () => {},
  );
}
