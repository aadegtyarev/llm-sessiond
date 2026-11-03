import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { cleanupPiTests, children, setupPi } from "./pi-native-core-support.js";

afterEach(cleanupPiTests);

describe("Pi uncertain and terminal native outcomes", () => {
  it.each(["no-response", "late-response", "malformed-response"])(
    "keeps %s input uncertain without retry",
    async (scenario) => {
      const { cwd, journal, runtime } = await setupPi("v2", scenario);
      const session = await runtime.create({ cwd });
      const inputStates: string[] = [];
      runtime.subscribe((event) => {
        if (event.kind === "input.state")
          inputStates.push(event.input?.state ?? "");
      });
      expect(await runtime.submit(session.id, "private turn")).toMatchObject({
        outcome: "unknown",
      });
      if (scenario !== "no-response")
        await new Promise((resolve) => setTimeout(resolve, 130));
      expect(
        (await readFile(journal, "utf8")).match(/\"type\":\"prompt\"/g),
      ).toHaveLength(1);
      expect(inputStates).toContain("uncertain");
      expect((await runtime.get(session.id))?.status).toBe(
        scenario === "no-response" ? "running" : "uncertain",
      );
      expect(await runtime.stop(session.id)).toBe(true);
    },
  );
  it("keeps read queries usable during input and pending effort mutation", async () => {
    const { cwd, runtime } = await setupPi("v2", "slow-effort");
    const session = await runtime.create({ cwd });
    await runtime.submit(session.id, "turn");
    const changing = runtime.changeEffort(session.id, "low");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await runtime.status(session.id)).toMatchObject({
      model: { id: "model-1" },
      effort: "low",
    });
    expect(await runtime.models(session.id)).toHaveProperty("models");
    expect(await changing).toBe("applied");
  });
  it("does not mark settlement before abort acknowledgement as canceled", async () => {
    const { cwd, runtime } = await setupPi("v2", "abort-before-ack");
    const session = await runtime.create({ cwd });
    const states: string[] = [];
    runtime.subscribe((event) => {
      if (event.kind === "input.state")
        states.push(`${event.input?.state}:${event.input?.reason ?? ""}`);
    });
    const input = await runtime.submit(session.id, "turn");
    expect(await runtime.cancel(session.id, input.inputId)).toEqual({
      kind: "rejected",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(states).toContain("completed:");
    expect(states).not.toContain("failed:canceled");
  });
  it("fails readiness safely and confirms child cleanup", async () => {
    const { cwd, runtime } = await setupPi("v2", "bad-ready");
    expect(await runtime.create({ cwd })).toMatchObject({ status: "failed" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(
      children.at(-1)?.exitCode !== null ||
        children.at(-1)?.signalCode !== null,
    ).toBe(true);
  });
  it("rejects once and only reports cancellation after accepted abort settles", async () => {
    const reject = await setupPi("v2", "reject");
    const session = await reject.runtime.create({ cwd: reject.cwd });
    expect(await reject.runtime.submit(session.id, "turn")).toMatchObject({
      outcome: "not-applied",
      failure: "prompt_rejected",
    });
    expect(
      (await readFile(reject.journal, "utf8")).match(/\"type\":\"prompt\"/g),
    ).toHaveLength(1);
    const slow = await setupPi("v2", "slow-turn");
    const active = await slow.runtime.create({ cwd: slow.cwd });
    const inputs: string[] = [];
    slow.runtime.subscribe((event) => {
      if (event.kind === "input.state")
        inputs.push(`${event.input?.state}:${event.input?.reason ?? ""}`);
    });
    const input = await slow.runtime.submit(active.id, "turn");
    await slow.runtime.cancel(active.id, input.inputId);
    await expect(
      slow.runtime.cancel(active.id, input.inputId),
    ).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(inputs).toContain("failed:canceled");
    expect(
      (await readFile(slow.journal, "utf8")).match(/\"type\":\"abort\"/g),
    ).toHaveLength(1);
  });
});
