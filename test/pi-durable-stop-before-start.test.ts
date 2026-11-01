import { describe, expect, it } from "vitest";
import { PiDurableProcess } from "../src/harness/pi-durable-process.js";

describe("Pi durable stop before start", () => {
  it("notifies existing subscribers and prevents later launch", async () => {
    let launches = 0;
    const process = new PiDurableProcess(
      {
        launch: () => {
          launches++;
          throw new Error();
        },
      },
      "pi",
      1,
    );
    const events: unknown[] = [];
    process.inputs.subscribe((event) => events.push(event));
    await process.stop();
    await process.stop();
    expect(events).toEqual([{ kind: "execution-ended" }]);
    await expect(process.start("/tmp", [])).rejects.toThrow(
      "EXECUTION_ALREADY_STARTED",
    );
    expect(launches).toBe(0);
  });
});
