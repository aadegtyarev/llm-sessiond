import { spawn } from "node:child_process";

const states = new WeakMap();
export class ProcessCleanupUnconfirmed extends Error {}

export function spawnChild(executable, args, options) {
  const child = spawn(executable, args, options);
  let finish;
  const state = {
    result: undefined,
    done: new Promise((resolve) => {
      finish = resolve;
    }),
  };
  const complete = (result) => {
    if (state.result) return;
    state.result = result;
    finish(result);
  };
  child.once("error", (error) => {
    state.error = error;
  });
  child.once("close", (code, signal) =>
    complete({ code, signal, error: state.error }),
  );
  states.set(child, state);
  return child;
}
export async function waitChild(child, timeoutMs) {
  const state = states.get(child);
  if (!state) throw new TypeError("child is not owned by smoke helper");
  if (state.result) return state.result;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    state.done.then((result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}
export async function confirmStopped(child) {
  const state = states.get(child);
  if (!state) throw new TypeError("child is not owned by smoke helper");
  if (state.result) return state.result;
  try {
    child.kill("SIGTERM");
  } catch {}
  let result = await waitChild(child, 1000);
  if (!result) {
    try {
      child.kill("SIGKILL");
    } catch {}
    result = await waitChild(child, 1000);
  }
  if (!result) throw new ProcessCleanupUnconfirmed();
  return result;
}
export async function stopChild(child) {
  const state = states.get(child);
  const result = await confirmStopped(child);
  if (state.error || result.error || result.signal || result.code !== 0)
    throw new ProcessCleanupUnconfirmed();
}
