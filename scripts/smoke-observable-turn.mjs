import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  confirmStopped,
  startSmokeDaemon,
} from "./smoke-observable-turn-process.mjs";

const daemonRoot = path.resolve(import.meta.dirname, "..");
const clientRoot = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("client checkout path required");
const work = await mkdtemp(path.join(os.tmpdir(), "observable-pi-turn-"));
let daemon;
let observer;
let sessionId;
let summary;
const waitFor = async (predicate, timeoutMs = 10_000) => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const value = predicate();
    if (value) return value;
    await delay(20);
  }
  throw new Error("observable turn timed out");
};
const frames = [];
const waitFrame = (predicate) => waitFor(() => frames.find(predicate));
try {
  const pidFile = path.join(work, "fake-pi.pid");
  const listen = await startSmokeDaemon(daemonRoot, work);
  daemon = listen.child;
  const sdk = await import(
    pathToFileURL(path.join(clientRoot, "dist/src/llm-sessiond/v2-client.js"))
  );
  const client = await sdk.connectLlmSessiondV2HttpClient({
    baseUrl: `http://127.0.0.1:${listen.port}`,
  });
  observer = client.subscribeEvents((frame) => frames.push(frame));
  await observer.opened;
  await waitFrame((frame) => frame.type === "snapshot.end");
  const created = await client.createSession({ cwd: work });
  sessionId = created.session.id;
  const outputPromise = waitFrame(
    (frame) =>
      frame.type === "event" &&
      frame.event.kind === "harness.event" &&
      frame.event.event.kind === "output",
  );
  const submitted = await client.submitInput(sessionId, {
    text: "integration prompt",
  });
  if (submitted.resumed !== false || !submitted.inputId)
    throw new Error("submit response mismatch");
  const output = await outputPromise;
  if (output.event.event.text !== "fake observable text")
    throw new Error("output mismatch");
  const terminal = await waitFrame(
    (frame) =>
      frame.type === "event" &&
      frame.event.kind === "harness.event" &&
      frame.event.event.kind === "input" &&
      frame.event.event.inputEvent.inputId === submitted.inputId &&
      ["completed", "failed", "uncertain"].includes(
        frame.event.event.inputEvent.state,
      ),
  );
  if (terminal.event.event.inputEvent.state !== "completed")
    throw new Error("input did not complete");
  if (readFileSync(path.join(work, "fake-pi-count"), "utf8") !== "1")
    throw new Error("prompt write count mismatch");
  observer.close();
  await client.stopSession(sessionId);
  await waitFor(() => {
    try {
      process.kill(Number(readFileSync(pidFile, "utf8")), 0);
      return false;
    } catch {
      return true;
    }
  });
  summary = output.event.event.text;
} finally {
  observer?.close();
  if (daemon) {
    try {
      const result = await confirmStopped(daemon);
      if (!result || result.code !== 0 || result.signal)
        throw new Error("daemon cleanup unconfirmed");
    } catch {
      throw new Error("daemon cleanup unconfirmed");
    }
  }
  await rm(work, { recursive: true, force: true });
}
console.log(JSON.stringify({ outcome: "passed", output: summary }));
