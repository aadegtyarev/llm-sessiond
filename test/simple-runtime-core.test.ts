import { describe, expect, it } from "vitest";
import { MemorySessionStore } from "../src/adapters/memory-store.js";
import type {
  HarnessEvent,
  HarnessPort,
} from "../src/interfaces/runtime-ports.js";
import { SessionRuntime } from "../src/kernel/index.js";

class FakeHarness implements HarnessPort {
  readonly descriptor = {
    id: "fake",
    aliases: [],
    capabilities: ["harness.stop", "harness.resume", "input.submit"],
  };
  writes = 0;
  #emit?: (event: HarnessEvent) => void;
  async start(
    _config: Parameters<HarnessPort["start"]>[0],
    emit: (event: HarnessEvent) => void,
  ): Promise<{ kind: "started" }> {
    this.#emit = emit;
    return { kind: "started" };
  }
  async submit(
    sessionId: string,
    input: { inputId: string; text: string },
  ): Promise<{ kind: "accepted" }> {
    this.writes += 1;
    this.#emit?.({ kind: "output", sessionId, text: input.text });
    this.#emit?.({ kind: "settled", sessionId, inputId: input.inputId });
    return { kind: "accepted" };
  }
  async stop(): Promise<{ kind: "confirmed" }> {
    return { kind: "confirmed" };
  }
  async shutdown(): Promise<{ kind: "confirmed" }> {
    return { kind: "confirmed" };
  }
}

describe("new session runtime core", () => {
  it("creates, submits once, publishes output and exact terminal input, then stops", async () => {
    let id = 0;
    const harness = new FakeHarness();
    const core = new SessionRuntime(
      new MemorySessionStore(),
      harness,
      () => ["SessionA", "Inputa"][id++]!,
    );
    const events: ReturnType<typeof JSON.parse>[] = [];
    core.subscribe((event) =>
      events.push(
        JSON.parse(JSON.stringify(event)) as ReturnType<typeof JSON.parse>,
      ),
    );
    const session = await core.create({ cwd: "/tmp" });
    const result = await core.submit(session.id, "hello");
    expect(result).toEqual({ inputId: "Inputa", resumed: false });
    expect(harness.writes).toBe(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "output",
        sessionId: "SessionA",
        text: "hello",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "input.state",
        input: { sessionId: "SessionA", inputId: "Inputa", state: "completed" },
      }),
    );
    expect(await core.stop(session.id)).toBe(true);
    expect((await core.get(session.id))?.status).toBe("stopped");
  });
});
