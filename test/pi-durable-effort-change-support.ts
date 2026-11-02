import type { EffortChangeCallContext } from "../src/core/effort-change-port.js";
import { PiDurableProcess } from "../src/harness/pi-durable-process.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

interface FixtureOptions {
  levels?: string[];
  setterSuccess?: boolean;
  applySetter?: boolean;
  stateId?: string;
}
export async function openPiEffort(options: FixtureOptions = {}) {
  const child = new FakePiChild();
  let thinkingLevel = "low";
  let states = 0;
  child.onWrite = (request) => {
    if (request.type === "get_state") {
      states += 1;
      child.send({
        type: "response",
        id: request.id,
        command: "get_state",
        success: true,
        data: {
          sessionId:
            states > 1 ? (options.stateId ?? "native-test") : "native-test",
          thinkingLevel,
        },
      });
    } else if (request.type === "get_available_thinking_levels") {
      child.send({
        type: "response",
        id: request.id,
        command: request.type,
        success: true,
        data: { levels: options.levels ?? ["low", "high"] },
      });
    } else if (request.type === "set_thinking_level") {
      if (options.applySetter !== false)
        thinkingLevel = request.level as string;
      child.send({
        type: "response",
        id: request.id,
        command: request.type,
        success: options.setterSuccess ?? true,
      });
    } else if (request.type === "prompt") {
      child.send({
        type: "response",
        id: request.id,
        command: request.type,
        success: true,
      });
    }
  };
  const durable = new PiDurableProcess(
    { launch: () => child.child },
    "fake-pi",
    1_000,
  );
  await durable.start(process.cwd(), []);
  return { process: durable, child };
}
export function piEffortContext(
  expectedNativeSessionId = "native-test",
  allowed = true,
): EffortChangeCallContext {
  return {
    expectedNativeSessionId,
    isCurrent: () => allowed,
    remainingMs: () => 30_000,
    beforeMutationWrite: () => allowed,
  };
}
