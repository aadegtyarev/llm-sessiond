import type { HarnessDescriptor } from "../interfaces/runtime-ports.js";

export type PiProfile = "v1" | "v2";
export function createPiDescriptor(profile: PiProfile): HarnessDescriptor {
  return {
    id: "pi",
    aliases: [],
    capabilities: [
      "harness.launch",
      "harness.resume",
      "harness.stop",
      "input.submit",
      "input.submit-images",
      "input.cancel",
      "input.cancel-current",
      "status.read",
      "usage.read",
      "models.read",
      "effort.read",
      "effort.change",
      "commands.read",
    ],
    metadata: { profile },
  };
}
