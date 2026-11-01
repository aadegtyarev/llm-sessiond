import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";

export function fakeChild(mode: string): ChildProcess {
  const child = new EventEmitter() as EventEmitter & Record<string, unknown>;
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  Object.assign(child, { stdin, stdout, exitCode: null, signalCode: null });
  const error = new Error("private stream failure");
  stdin.write = ((chunk: string, callback?: (error?: Error | null) => void) => {
    setImmediate(() => {
      if (mode === "callback-and-error") {
        callback?.(error);
        stdin.emit("error", error);
      } else if (mode === "stdin-error") stdin.emit("error", error);
      else if (mode === "stdout-error") stdout.emit("error", error);
      else child.emit("error", error);
    });
    return true;
  }) as typeof stdin.write;
  Object.assign(child, {
    kill: () => true,
  });
  return child as unknown as ChildProcess;
}
