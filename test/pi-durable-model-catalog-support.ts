import type { ProcessProvider } from "../src/core/ports.js";
import { PiDurableProcess } from "../src/harness/pi-durable-process.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

export function answer(
  child: FakePiChild,
  request: Record<string, unknown>,
  data: Record<string, unknown>,
) {
  child.send({
    type: "response",
    id: request.id,
    command: request.type,
    success: true,
    data,
  });
}
export function processFor(child: FakePiChild) {
  return new PiDurableProcess(
    { launch: () => child.child } as ProcessProvider,
    "pi",
    100,
    async () => child.confirmExit(),
  );
}
