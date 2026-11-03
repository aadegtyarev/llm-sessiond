import path from "node:path";
import { confirmStopped, spawnChild } from "./v2-smoke-child.mjs";

export async function startSmokeDaemon(root, work) {
  return new Promise((resolve, reject) => {
    const child = spawnChild(
      process.execPath,
      [path.join(root, "dist/main-v2.js")],
      {
        env: {
          PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
          HOME: work,
          XDG_CONFIG_HOME: path.join(work, "config"),
          LLM_SESSIOND_STATE_DIR: path.join(work, "state"),
          HOST: "127.0.0.1",
          PORT: "0",
          PI_EXECUTABLE: path.join(root, "test/fixtures/v2/fake-pi-rpc.mjs"),
          FAKE_PI_PID_FILE: path.join(work, "fake-pi.pid"),
        },
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    let text = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      text += chunk;
      const match = /127\.0\.0\.1:(\d+)/.exec(text);
      if (match) resolve({ child, port: Number(match[1]) });
    });
    child.once("error", reject);
    child.once("exit", () =>
      reject(new Error("daemon exited before readiness")),
    );
  });
}

export { confirmStopped };
