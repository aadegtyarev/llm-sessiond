import { describe, expect, it } from "vitest";
import { PiDurableProcess } from "../src/harness/pi-durable-process.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

function promptCount(child: FakePiChild): number {
  return child.writes.filter((entry) => entry.type === "prompt").length;
}
describe("Pi durable stop fences", () => {
  it("closes admission through gated failure and confirmed retry", async () => {
    const child = new FakePiChild();
    let rejectFirst: ((error: Error) => void) | undefined;
    let releaseRetry: (() => void) | undefined;
    let attempts = 0;
    const process = new PiDurableProcess(
      { launch: () => child.child },
      "pi",
      1000,
      async (owned) => {
        expect(owned).toBe(child.child);
        attempts++;
        if (attempts === 1)
          await new Promise<void>((_resolve, reject) => {
            rejectFirst = reject;
          });
        else if (attempts === 2) return;
        else {
          await new Promise<void>((resolve) => {
            releaseRetry = resolve;
          });
          child.confirmExit();
        }
      },
    );
    try {
      await process.start("/tmp", []);
      let ended = 0;
      process.inputs.subscribe((event) => {
        if ((event as { kind?: string }).kind === "execution-ended") ended++;
      });
      const pendingAck = process.inputs.submit({
        inputId: "opaque-1",
        text: "gated ack",
      });
      expect(promptCount(child)).toBe(1);
      const firstStop = process.stop();
      expect(ended).toBe(1);
      expect(await pendingAck).toEqual({ kind: "uncertain" });
      expect(
        (await process.inputs.submit({ inputId: "opaque-2", text: "blocked" }))
          .kind,
      ).toBe("uncertain");
      expect(promptCount(child)).toBe(1);
      rejectFirst!(new Error("unconfirmed"));
      await expect(firstStop).rejects.toThrow("unconfirmed");
      expect(
        (
          await process.inputs.submit({
            inputId: "opaque-3",
            text: "still blocked",
          })
        ).kind,
      ).toBe("uncertain");
      await expect(process.stop()).rejects.toThrow("STOP_UNCONFIRMED");
      expect(child.stdin.listenerCount("error")).toBe(1);
      expect(
        (
          await process.inputs.submit({
            inputId: "opaque-4",
            text: "unconfirmed blocked",
          })
        ).kind,
      ).toBe("uncertain");
      expect(promptCount(child)).toBe(1);
      const retry = process.stop();
      expect(
        (
          await process.inputs.submit({
            inputId: "opaque-5",
            text: "retry blocked",
          })
        ).kind,
      ).toBe("uncertain");
      releaseRetry!();
      await retry;
      expect(attempts).toBe(3);
      expect(child.stdin.listenerCount("error")).toBe(0);
      expect(child.stdout.listenerCount("data")).toBe(0);
      expect(promptCount(child)).toBe(1);
      expect(ended).toBe(1);
    } finally {
      rejectFirst?.(new Error("test cleanup"));
      releaseRetry?.();
      try {
        await process.stop();
      } catch {
        child.confirmExit();
      }
    }
  });
});
