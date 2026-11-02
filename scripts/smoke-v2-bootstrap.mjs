import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bindFailure } from "./v2-smoke-bind.mjs";
import {
  exitCode,
  signalDuringStartup,
  startV2,
  stopV2,
} from "./v2-smoke-process.mjs";
import { ProcessCleanupUnconfirmed, spawnChild } from "./v2-smoke-child.mjs";
import { connectHealthy } from "./v2-smoke-health.mjs";
import { seedRunningSession } from "./v2-smoke-seed.mjs";

const [clientRoot] = process.argv.slice(2);
if (!clientRoot) throw new Error("usage: smoke-v2-bootstrap.mjs <client-root>");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(path.join(os.tmpdir(), "llm-sessiond-v2-smoke-"));
const state = path.join(temp, "state");
const env = {
  ...(process.platform === "win32" && process.env.SystemRoot
    ? { SystemRoot: process.env.SystemRoot }
    : {}),
  HOME: temp,
  XDG_STATE_HOME: path.join(temp, "xdg"),
  LLM_SESSIOND_STATE_DIR: state,
  PORT: "0",
  HOST: "127.0.0.1",
  PATH: "",
};
let child;
let cleanupSafe = true;
let stage = "seed";
try {
  stage = "startup-signals";
  await signalDuringStartup(root, env, path.join(temp, "signal-state"));
  await seedRunningSession(root, state, temp);
  stage = "start";
  const app = await startV2(root, env);
  child = app.child;
  const clientModule = await import(
    pathToFileURL(path.join(clientRoot, "dist/src/llm-sessiond/v2-client.js"))
  );
  const { client, health } = await connectHealthy(
    clientModule,
    new URL(app.base).origin,
    "",
  );
  await client.harnesses();
  const sessions = await client.listSessions();
  if (sessions.sessions[0]?.status !== "stopped") throw Error();
  const detail = await client.getSession("seed");
  if (detail.session.id !== "seed" || detail.session.status !== "stopped")
    throw Error();
  await client.stopSession("seed");
  const v1 = await fetch(`${app.base.replace("/api/v2", "")}/api/v1/health`);
  if (!v1.ok) throw Error();
  const contender = spawnChild(
    process.execPath,
    [path.join(root, "dist/main-v2.js")],
    { env, stdio: "ignore" },
  );
  if ((await exitCode(contender)) !== 1) throw Error();
  await stopV2(child);
  child = undefined;
  const restarted = await startV2(root, env);
  child = restarted.child;
  const nextClientModule = await import(
    pathToFileURL(path.join(clientRoot, "dist/src/llm-sessiond/v2-client.js"))
  );
  const { client: nextClient } = await connectHealthy(
    nextClientModule,
    new URL(restarted.base).origin,
    health.instanceId,
  );
  const recovered = await nextClient.getSession("seed");
  if (recovered.session.id !== "seed" || recovered.session.status !== "stopped")
    throw Error();
  await stopV2(child);
  child = undefined;
  stage = "bind-failure";
  await bindFailure(root, env, path.join(temp, "bind-state"));
  console.log("portable v2 bootstrap process smoke passed");
} catch (error) {
  if (error instanceof ProcessCleanupUnconfirmed) cleanupSafe = false;
  console.error(`portable v2 bootstrap process smoke failed (${stage})`);
  process.exitCode = 1;
} finally {
  if (child) {
    try {
      await stopV2(child);
    } catch {
      cleanupSafe = false;
    }
  }
  if (cleanupSafe) await rm(temp, { recursive: true, force: true });
}
