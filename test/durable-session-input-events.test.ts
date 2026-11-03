import { describe, expect, it } from "vitest";
import { flushEvents, setup, synthetic } from "./durable-manager-support.js";

describe("durable input domain events", () => {
  it("preserves every input ID and isolates observer failures", async () => {
    let deliver: ((event: unknown) => void) | undefined;
    const { manager } = setup({
      id: () => "Opaque.ID",
      adapter: {
        ...synthetic,
        descriptor: {
          ...synthetic.descriptor,
          capabilities: [
            "harness.launch",
            "harness.resume",
            "harness.stop",
            "input.submit",
          ],
        },
      },
      inputs: {
        submit: async () => ({ kind: "accepted" }),
        cancel: async () => ({ kind: "accepted" }),
        subscribe: (listener) => {
          deliver = listener;
          return () => {
            deliver = undefined;
          };
        },
      },
    });
    const safe: string[] = [];
    manager.events.subscribe(() => {
      throw new Error("observer failure");
    });
    manager.events.subscribe((record) =>
      safe.push(JSON.stringify(record.event)),
    );
    const session = await manager.create({ cwd: process.cwd() });
    const result = await manager.inputs.submit(session.id, { text: "x" });
    deliver?.({ inputId: result.inputId, state: "completed" });
    await flushEvents();
    expect(result.inputId).toBe("Opaque.ID");
    const inputs = safe
      .map(
        (record) =>
          JSON.parse(record) as {
            kind: string;
            event?: { inputEvent: { inputId: string; state: string } };
          },
      )
      .filter(
        (record) => record.kind === "harness.event" && record.event?.inputEvent,
      );
    expect(inputs.map((record) => record.event!.inputEvent.state)).toEqual([
      "pending",
      "accepted",
      "completed",
    ]);
    expect(
      inputs.every(
        (record) => record.event!.inputEvent.inputId === "Opaque.ID",
      ),
    ).toBe(true);
  });
});
