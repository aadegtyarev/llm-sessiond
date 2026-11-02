import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
export function fakeClaudeTextProcess(): {
  child: ChildProcess;
  stdout: PassThrough;
  userRecord: () => string;
  writeDone: () => void;
} {
  const child = new EventEmitter() as EventEmitter & Record<string, unknown>;
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  let user = "";
  let complete: ((error?: Error | null) => void) | undefined;
  stdin.write = ((chunk: string, callback?: (error?: Error | null) => void) => {
    if (JSON.parse(chunk).type === "user") {
      user = chunk;
      complete = callback;
    } else callback?.();
    return true;
  }) as typeof stdin.write;
  Object.assign(child, {
    stdin,
    stdout,
    exitCode: null,
    signalCode: null,
    kill: () => true,
  });
  return {
    child: child as unknown as ChildProcess,
    stdout,
    userRecord: () => user,
    writeDone: () => complete?.(),
  };
}
