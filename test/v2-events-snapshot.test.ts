import { describe, expect, it } from "vitest";
import { containsKey, load } from "./v2-fixture-support.js";

describe("v2 event and snapshot fixtures", () => {
  it("preserves rich event projections without internal diagnostics", () => {
    const f = load("rich-events.json");
    expect(
      f.events.map((event: { sequence: number }) => event.sequence),
    ).toEqual([1, 2, 3, 4, 5]);
    expect(f.events[1].event.event.type).toBe("anomaly");
    expect(f.events[2].event.event.state).toBe("uncertain");
    expect(f.events[3].event.event.type).toBe("tool_summary");
    for (const key of f.forbiddenPublicFields)
      expect(containsKey(f.events, key.split(".").at(-1)!)).toBe(false);
  });
  it("uses instance-local cursors and snapshot barriers across restart", () => {
    const f = load("snapshot-restart.json");
    expect(f.snapshot.ordering).toContain("after-snapshot.end");
    expect(f.snapshot.begin.afterSequence).toBe(5);
    expect(f.restart).toMatchObject({
      cursorReplay: "unsupported",
      clientAction: "new-handshake-snapshot-no-replay",
    });
  });
});
