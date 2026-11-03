import type {
  HarnessPort,
  StartOutcome,
  StopOutcome,
  SubmitOutcome,
} from "../src/interfaces/runtime-ports.js";

export class BoundaryHarness implements HarnessPort {
  readonly descriptor = {
    id: "fake",
    aliases: [],
    capabilities: [
      "harness.stop",
      "harness.resume",
      "input.submit",
      "status.read",
      "usage.read",
      "models.read",
      "effort.read",
      "effort.change",
    ],
  };
  starts: number[] = [];
  writes: string[] = [];
  beforeSubmit?: () => void;
  async start(
    config: Parameters<HarnessPort["start"]>[0],
  ): Promise<StartOutcome> {
    this.starts.push(Number(config.checkpoint?.version ?? 0));
    return { kind: "started" };
  }
  async submit(
    _id: string,
    input: { inputId: string },
    beforeWrite: () => boolean,
  ): Promise<SubmitOutcome> {
    this.beforeSubmit?.();
    if (!beforeWrite()) return { kind: "uncertain" };
    this.writes.push(input.inputId);
    return { kind: "accepted" };
  }
  async status(): Promise<{
    model: { provider: string; id: string; name: string };
    usage: { inputTokens: number };
  }> {
    return {
      model: { provider: "p", id: "m", name: "Model" },
      usage: { inputTokens: 3 },
    };
  }
  async models(): Promise<{
    models: Array<{ provider: string; id: string; name: string }>;
  }> {
    return { models: [{ provider: "p", id: "m", name: "Model" }] };
  }
  async efforts(): Promise<{ levels: string[] }> {
    return { levels: ["low", "high"] };
  }
  async changeEffort(
    _id: string,
    _level: string,
    beforeWrite: () => boolean,
  ): Promise<"applied" | "unknown"> {
    return beforeWrite() ? "applied" : "unknown";
  }
  async stop(): Promise<StopOutcome> {
    return { kind: "unknown" };
  }
  async shutdown(): Promise<StopOutcome> {
    return { kind: "confirmed" };
  }
}
