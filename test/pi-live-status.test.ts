import { describe, expect, it } from "vitest";
import { projectPiLiveStatus } from "../src/harness/pi-live-status.js";

describe("Pi live status projection", () => {
  it("projects only approved selection and usage fields with zero and null intact", () => {
    expect(
      projectPiLiveStatus(
        {
          model: { provider: "p", id: "m", name: "M", secret: "x" },
          thinkingLevel: "high",
          prompt: "hidden",
        },
        {
          tokens: { total: 0, input: 3, secret: 9 },
          cost: 0,
          contextUsage: { tokens: null, percent: 0, contextWindow: 10 },
        },
      ),
    ).toEqual({
      model: { provider: "p", id: "m", name: "M" },
      effort: "high",
      usage: {
        totalTokens: 0,
        inputTokens: 3,
        costUsd: 0,
        contextTokens: null,
        contextWindow: 10,
        contextPercent: 0,
      },
    });
  });
  it("rejects malformed known native values", () => {
    expect(() => projectPiLiveStatus({ model: "bad" }, {})).toThrow(
      "INVALID_LIVE_STATUS",
    );
    expect(() => projectPiLiveStatus({}, { tokens: { total: -1 } })).toThrow(
      "INVALID_LIVE_STATUS",
    );
  });
});
