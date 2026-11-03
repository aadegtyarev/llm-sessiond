import type {
  HarnessEvent,
  HarnessPort,
  SubmitOutcome,
} from "../src/interfaces/runtime-ports.js";

export class DelayedHarness implements HarnessPort {
  readonly descriptor = {
    id: "fake",
    aliases: [],
    capabilities: [
      "harness.stop",
      "harness.resume",
      "input.submit",
      "input.cancel",
      "input.cancel-current",
    ],
  };
  emit?: (event: HarnessEvent) => void;
  ack?: (outcome: SubmitOutcome) => void;
  writes = 0;
  cancels = 0;
  async start(
    _config: Parameters<HarnessPort["start"]>[0],
    emit: (event: HarnessEvent) => void,
  ): Promise<{ kind: "started" }> {
    this.emit = emit;
    return { kind: "started" };
  }
  async submit(): Promise<SubmitOutcome> {
    this.writes += 1;
    return new Promise((resolve) => {
      this.ack = resolve;
    });
  }
  async stop(): Promise<{ kind: "confirmed" }> {
    return { kind: "confirmed" };
  }
  async cancel(): Promise<{ kind: "accepted" }> {
    this.cancels += 1;
    return { kind: "accepted" };
  }
  async shutdown(): Promise<{ kind: "confirmed" }> {
    return { kind: "confirmed" };
  }
}
