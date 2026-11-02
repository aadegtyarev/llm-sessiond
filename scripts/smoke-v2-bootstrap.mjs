import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  bindFailure,
  exitCode,
  signalDuringStartup,
  startV2,
  stopV2,
} from "./v2-smoke-process.mjs";

const [clientRoot] = process.argv.slice(2);
if (!clientRoot) throw new Error("usage: smoke-v2-bootstrap.mjs <client-root>");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(pathToFileURL(path.join(root, "package.json")));
const zodUrl = pathToFileURL(require.resolve("zod")).href;
registerHooks({
  resolve: (specifier, context, nextResolve) =>
    nextResolve(specifier === "zod" ? zodUrl : specifier, context),
});
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
let stage = "seed";
try {
  stage = "startup-signals";
  await signalDuringStartup(root, env, path.join(temp, "signal-state"));
  const { openSessionDatabase } = await import(
    pathToFileURL(path.join(root, "dist/persistence/sqlite-database.js"))
  );
  const { SessionRepository } = await import(
    pathToFileURL(path.join(root, "dist/persistence/session-repository.js"))
  );
  await mkdir(state, { recursive: true, mode: 0o700 });
  const db = openSessionDatabase(path.join(state, "sessions.sqlite3"));
  new SessionRepository(db).create({
    id: "seed",
    harnessId: "claude-code",
    cwd: temp,
    status: "running",
    createdAt: new Date().toISOString(),
  });
  db.close();
  stage = "start";
  const app = await startV2(root, env);
  child = app.child;
  const clientModule = await import(
    pathToFileURL(path.join(clientRoot, "dist/src/llm-sessiond/v2-client.js"))
  );
  const client = await clientModule.connectLlmSessiondV2HttpClient({
    baseUrl: new URL(app.base).origin,
  });
  const health = await client.health();
  if (health.status !== "ready" || !health.supportedApiVersions.includes("v1"))
    throw Error();
  await client.harnesses();
  const sessions = await client.listSessions();
  if (sessions.sessions[0]?.status !== "stopped") throw Error();
  await client.getSession("seed");
  await client.stopSession("seed");
  const v1 = await fetch(`${app.base.replace("/api/v2", "")}/api/v1/health`);
  if (!v1.ok) throw Error();
  const contender = spawn(
    process.execPath,
    [path.join(root, "dist/main-v2.js")],
    { env, stdio: "ignore" },
  );
  if ((await exitCode(contender)) === 0) throw Error();
  await stopV2(child);
  child = undefined;
  const restarted = await startV2(root, env);
  child = restarted.child;
  const next = await (await fetch(`${restarted.base}/api/v2/health`)).json();
  if (next.instanceId === health.instanceId) throw Error();
  await stopV2(child);
  child = undefined;
  stage = "bind-failure";
  await bindFailure(root, env, path.join(temp, "bind-state"));
  console.log("portable v2 bootstrap process smoke passed");
} catch {
  console.error(`portable v2 bootstrap process smoke failed (${stage})`);
  process.exitCode = 1;
} finally {
  if (child) await stopV2(child).catch(() => {});
  await rm(temp, { recursive: true, force: true });
}
