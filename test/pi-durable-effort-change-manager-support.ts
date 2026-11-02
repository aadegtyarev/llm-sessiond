import { createPiDurableRuntime } from "../src/harness/pi-durable-runtime.js";
import { MemoryStore } from "./durable-memory-store.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

export interface NativeMode {
  levels?: string[];
  setter?: "false" | "malformed" | "timeout" | "write-error" | "exit";
  apply?: boolean;
  wrongReadbackId?: boolean;
}
export async function openNative(mode: NativeMode = {}) {
  const child = new FakePiChild();
  let level = "low";
  let states = 0;
  child.onWrite = (request) => {
    if (request.type === "get_state") {
      states += 1;
      child.send({
        type: "response",
        id: request.id,
        command: request.type,
        success: true,
        data: {
          sessionId:
            mode.wrongReadbackId && states === 3 ? "other" : "native-test",
          thinkingLevel: level,
        },
      });
    } else if (request.type === "get_available_thinking_levels") {
      child.send({
        type: "response",
        id: request.id,
        command: request.type,
        success: true,
        data: { levels: mode.levels ?? ["low", "high"] },
      });
    } else if (request.type === "set_thinking_level") {
      if (mode.apply !== false) level = request.level as string;
      if (mode.setter === "timeout") return;
      if (mode.setter === "write-error")
        throw new Error("native private secret");
      if (mode.setter === "exit") {
        child.confirmExit();
        return;
      }
      child.send({
        type: "response",
        id: request.id,
        command: request.type,
        success:
          mode.setter === "malformed" ? "invalid" : mode.setter !== "false",
      });
    }
  };
  const runtime = createPiDurableRuntime({
    store: new MemoryStore(),
    owner: { token: "test-owner", generation: 1 },
    provider: { launch: () => child.child },
  });
  const session = await runtime.manager.create({ cwd: process.cwd() });
  return { child, runtime, session };
}
