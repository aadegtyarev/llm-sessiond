import { describe, expect, it } from "vitest";
import { evaluateGuards } from "./v2-guard-evaluator.js";
import { load } from "./v2-fixture-support.js";

describe("guard write invalidation races", () => {
  it("returns uncertain/no-replay after dispatch for all invalidation causes", () => {
    const n = load("guard-races-null.json");
    expect(evaluateGuards(n.steps)).toEqual([
      "awaiting-invalidate-ack",
      "acknowledged",
      "write-dispatched",
      "uncertain-no-replay",
      "uncertain-no-replay",
      "acknowledged",
      "uncertain-no-replay",
    ]);
    const s = load("guard-races-session.json");
    expect(evaluateGuards(s.beforeAck).slice(-4)).toEqual([
      "uncertain-no-replay",
      "uncertain-no-replay",
      "acknowledged",
      "uncertain-no-replay",
    ]);
    expect(evaluateGuards(s.afterAck).slice(-3)).toEqual([
      "uncertain-no-replay",
      "acknowledged",
      "uncertain-no-replay",
    ]);
    const g = load("guard-races-generation.json");
    expect(evaluateGuards(g.beforeAck).slice(-3)).toEqual([
      "uncertain-no-replay",
      "uncertain-no-replay",
      "acknowledged",
    ]);
    expect(evaluateGuards(g.afterAck).slice(-3)).toEqual([
      "uncertain-no-replay",
      "acknowledged",
      "uncertain-no-replay",
    ]);
    const d = load("guard-races-disconnect.json");
    expect(evaluateGuards(d.afterDispatch).slice(-2)).toEqual([
      "uncertain-no-replay",
      "uncertain-no-replay",
    ]);
    expect(evaluateGuards(d.preWriteMismatch).at(-1)).toBe(
      "rejected-before-write",
    );
  });
});
