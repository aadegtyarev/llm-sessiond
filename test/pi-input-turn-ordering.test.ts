import { describe, expect, it } from "vitest";
import { PiInputTurn } from "../src/harness/pi-input-turn.js";

describe("Pi input settlement ordering", () => {
  it("waits for settlement after abort acknowledgement", () => {
    const states: Record<string, unknown>[] = [];
    const turn = new PiInputTurn((type, data) => {
      if (type === "input.state") states.push(data);
    });
    turn.begin("input");
    turn.accepted();
    turn.acceptInput("input");
    turn.beginCancel();
    turn.acknowledged();
    expect(turn.isActive("input")).toBe(true);
    turn.onSettled();
    expect(turn.isActive("input")).toBe(false);
    expect(states.at(-1)).toMatchObject({
      state: "failed",
      reason: "cancelled",
    });
  });
  it("waits for abort acknowledgement when settlement arrives first", () => {
    const states: Record<string, unknown>[] = [];
    const turn = new PiInputTurn((type, data) => {
      if (type === "input.state") states.push(data);
    });
    turn.begin("input");
    turn.accepted();
    turn.acceptInput("input");
    turn.beginCancel();
    turn.onSettled();
    expect(turn.isActive("input")).toBe(true);
    turn.acknowledged();
    expect(turn.isActive("input")).toBe(false);
    expect(states.at(-1)).toMatchObject({
      state: "failed",
      reason: "cancelled",
    });
  });
  it("completes normally when settlement precedes abort rejection", () => {
    const states: Record<string, unknown>[] = [];
    const turn = new PiInputTurn((type, data) => {
      if (type === "input.state") states.push(data);
    });
    turn.begin("input");
    turn.accepted();
    turn.acceptInput("input");
    turn.beginCancel();
    turn.onSettled();
    turn.abortRejected();
    expect(turn.isActive("input")).toBe(false);
    expect(states.at(-1)).toMatchObject({ state: "completed" });
  });
  it("reconciles an abort timeout with settled and later-settled turns", () => {
    for (const settleBeforeTimeout of [true, false]) {
      const states: Record<string, unknown>[] = [];
      const turn = new PiInputTurn((type, data) => {
        if (type === "input.state") states.push(data);
      });
      turn.begin("input");
      turn.accepted();
      turn.acceptInput("input");
      turn.beginCancel();
      if (settleBeforeTimeout) turn.onSettled();
      expect(turn.uncertain()).toBe(!settleBeforeTimeout);
      if (!settleBeforeTimeout) turn.onSettled();
      expect(turn.isActive("input")).toBe(false);
      expect(states.at(-1)).toMatchObject({
        state: "completed",
      });
    }
  });
});
