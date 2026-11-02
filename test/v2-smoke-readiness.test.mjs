import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { waitReady } from "../scripts/v2-smoke-readiness.mjs";

describe("portable smoke readiness framing", () => {
  it("waits for a complete newline-terminated readiness record", async () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    let settled = false;
    const ready = waitReady(child).then((value) => {
      settled = true;
      return value;
    });
    child.stdout.emit("data", "llm-sessiond v2 listening on 127.0.0.1:4318");
    await Promise.resolve();
    expect(settled).toBe(false);
    child.stdout.emit("data", String.fromCharCode(10));
    await expect(ready).resolves.toBe("http://127.0.0.1:4318/api/v2");
  });
  it("rejects non-health startup output", async () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    const ready = waitReady(child);
    child.stdout.emit(
      "data",
      `HTTP/1.1 404 Not Found${String.fromCharCode(10)}`,
    );
    child.emit("close", 1, null);
    await expect(ready).rejects.toThrow();
  });
});
