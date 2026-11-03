import { mkdtemp, rm } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemorySessionStore } from "../src/adapters/memory-store.js";
import {
  PiHarnessPort,
  type PiProfile,
} from "../src/adapters/pi-harness-port.js";
import { SessionRuntime } from "../src/kernel/session-runtime.js";
import type { ProcessProvider } from "../src/core/ports.js";

const fixture = fileURLToPath(
  new URL("./fixtures/fake-pi-native.mjs", import.meta.url),
);
const runtimes: SessionRuntime[] = [];
export const children: ChildProcess[] = [];
const dirs: string[] = [];
export async function cleanupPiTests(): Promise<void> {
  for (const runtime of runtimes.splice(0))
    if (!(await runtime.shutdown()))
      throw new Error("Pi child cleanup was not confirmed");
  if (
    children.some(
      (child) => child.exitCode === null && child.signalCode === null,
    )
  )
    throw new Error("Pi child remains after runtime shutdown");
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
}
export async function setupPi(profile: PiProfile = "v2", scenario = "normal") {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "pi-native-core-"));
  dirs.push(cwd);
  const pidFile = path.join(cwd, "child.pid"),
    journal = path.join(cwd, "rpc.jsonl");
  const launchArgs: string[][] = [];
  const provider: ProcessProvider = {
    launch: (_exe, args, working) => {
      launchArgs.push([...args]);
      const child = spawn(
        process.execPath,
        [fixture, ...args, "--fake-scenario", scenario],
        {
          cwd: working,
          shell: false,
          stdio: ["pipe", "pipe", "pipe"],
          env: { FAKE_PI_PID_FILE: pidFile, FAKE_PI_JOURNAL: journal },
        },
      );
      children.push(child);
      return child;
    },
  };
  const store = new MemorySessionStore();
  const port = new PiHarnessPort(provider, "pi", profile, 500, 300, 40);
  const runtime = new SessionRuntime(store, port, () => "session-opaque");
  runtimes.push(runtime);
  return { cwd, journal, store, runtime, launchArgs, port };
}
