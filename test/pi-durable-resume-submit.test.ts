import { describe, expect, it } from "vitest";
import { createPiTestManager } from "./pi-durable-manager-support.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

describe("Pi durable exact resume submit", () => {
  it("submits after exact resume and fences old execution replies", async () => {
    const children: FakePiChild[] = [];
    const launches: string[][] = [];
    const provider = {
      launch: (_exe: string, args: string[]) => {
        launches.push(args);
        const child = new FakePiChild();
        children.push(child);
        return child.child;
      },
    };
    let sequence = 0;
    const manager = createPiTestManager(provider, () => `opaque-${++sequence}`);
    try {
      const session = await manager.create({ cwd: "/tmp" });
      const oldChild = children[0]!;
      expect(oldChild.stdout.listenerCount("data")).toBe(1);
      let promptSent!: () => void;
      const sent = new Promise<void>((resolve) => {
        promptSent = resolve;
      });
      const initialWrite = oldChild.onWrite!;
      oldChild.onWrite = (request) => {
        initialWrite(request);
        if (request.type === "prompt") promptSent();
      };
      const states: Array<{ id: string; state: string }> = [];
      let completeNew!: () => void;
      const newCompleted = new Promise<void>((resolve) => {
        completeNew = resolve;
      });
      manager.inputs.subscribe((event) => {
        if ("inputId" in event && event.inputId === "opaque-3") {
          states.push({ id: event.inputId, state: event.state });
          if (event.state === "completed") completeNew();
        }
      });
      const oldSubmit = manager.inputs
        .submit(session.id, { text: "old pending" })
        .then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
      await sent;
      await manager.stop(session.id);
      expect(await oldSubmit).toMatchObject({
        error: { code: "INPUT_UNCERTAIN" },
      });
      await manager.resume(session.id);
      expect(launches[1]?.join(" ")).toBe("--mode rpc --session native-test");
      const newChild = children[1]!;
      expect(newChild.stdout.listenerCount("data")).toBe(1);
      const startWrite = newChild.onWrite!;
      newChild.onWrite = (request) => {
        startWrite(request);
        if (request.type === "prompt") {
          newChild.send({
            type: "response",
            id: request.id,
            command: "prompt",
            success: true,
          });
          newChild.send({ type: "agent_settled" });
        }
      };
      const submitted = await manager.inputs.submit(session.id, {
        text: "resumed exact text",
      });
      expect(submitted.inputId).toBe("opaque-3");
      const prompt = newChild.writes.find((entry) => entry.type === "prompt")!;
      expect(prompt).toMatchObject({
        message: "resumed exact text",
        streamingBehavior: "steer",
      });
      expect(prompt).not.toHaveProperty("inputId");
      await newCompleted;
      const before = [...states];
      oldChild.send({
        type: "response",
        id: "late-old",
        command: "prompt",
        success: true,
      });
      oldChild.send({ type: "agent_settled" });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(states).toEqual(before);
      expect(states).toContainEqual({ id: "opaque-3", state: "completed" });
      expect(
        newChild.writes.filter((entry) => entry.type === "prompt"),
      ).toHaveLength(1);
    } finally {
      await manager.shutdownOwned();
    }
  });
});
