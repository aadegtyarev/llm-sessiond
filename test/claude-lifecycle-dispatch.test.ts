import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it } from "vitest";
import { initializeClaude } from "../src/harness/claude-lifecycle-startup.js";

const sessionId = "12345678-abcd-4abc-8abc-1234567890ab";
const ack = JSON.stringify({
  type: "control_response",
  response: {
    request_id: `llm-sessiond-${sessionId}`,
    subtype: "success",
    response: {},
  },
});

describe("Claude startup lifetime dispatch", () => {
  it("routes post-ACK records from the same chunk and retains partial decoder state", async () => {
    const { child, output, stdout } = fakeChild();
    const records: string[] = [];
    const ready = initializeClaude(child, sessionId, 500, {
      onRecord: (line) => records.push(line),
    });
    expect(output()).toContain('"subtype":"initialize"');
    stdout.write(
      `${ack}\n${JSON.stringify({ type: "metadata", session_id: sessionId })}\n`,
    );
    await ready;
    stdout.write('{"type":"res');
    stdout.write('ult","session_id":"12345678-abcd-4abc-8abc-1234567890ab"}\n');
    expect(records).toHaveLength(2);
    stdout.emit("end");
    child.emit("close", 0, null);
  });
  it("contains receiver exceptions and fences records after one terminal notification", async () => {
    const { child, stdout } = fakeChild();
    const terminals: string[] = [];
    let received = 0;
    const ready = initializeClaude(child, sessionId, 500, {
      onRecord: () => {
        received++;
        throw new Error("private");
      },
      onTerminal: (reason) => terminals.push(reason),
    });
    stdout.write(`${ack}\n`);
    await ready;
    stdout.write('{"type":"one"}\n');
    child.emit("exit", 1, null);
    stdout.write('{"type":"late"}\n');
    child.emit("close", 1, null);
    expect(received).toBe(1);
    expect(terminals).toEqual(["process_exit"]);
  });
});

function fakeChild(): {
  child: ChildProcess;
  output: () => string;
  stdout: PassThrough;
} {
  const child = new EventEmitter() as EventEmitter & Record<string, unknown>;
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  let writes = "";
  stdin.write = ((chunk: string, callback?: (error?: Error | null) => void) => {
    writes += chunk;
    callback?.();
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
    output: () => writes,
    stdout,
  };
}
