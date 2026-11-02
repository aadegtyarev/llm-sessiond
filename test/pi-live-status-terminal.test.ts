import { describe, expect, it } from "vitest";
import type { ProcessProvider } from "../src/core/ports.js";
import { PiDurableProcess } from "../src/harness/pi-durable-process.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

describe("Pi live status terminal fencing", () => {
  it("rejects terminal delivery after both replies resolve before await continues", async () => {
    const child = new FakePiChild();
    let startup = true;
    child.onWrite = (request) => {
      child.send({
        type: "response",
        id: request.id,
        command: request.type,
        success: true,
        data: request.type === "get_state" ? { sessionId: "native-test" } : {},
      });
      if (request.type === "get_state") startup = false;
      if (request.type === "get_session_stats" && !startup) child.confirmExit();
    };
    const process = new PiDurableProcess(
      { launch: () => child.child } as ProcessProvider,
      "pi",
      100,
      async () => child.confirmExit(),
    );
    try {
      await process.start("/tmp", []);
      await expect(process.readLiveStatus()).rejects.toThrow("RPC_UNAVAILABLE");
    } finally {
      await process.stop();
    }
  });
});
