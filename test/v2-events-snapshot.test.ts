import { describe, expect, it } from "vitest";
import { containsKey, load } from "./v2-fixture-support.js";
import { liveEvent, snapshotFrame } from "./v2-bridge-event-schema.js";
import { validateSnapshotTranscript } from "./v2-snapshot-evaluator.js";

describe("v2 event and snapshot wire fixtures", () => {
  it("strictly validates every standard and namespaced event payload", () => {
    const files = [
      "events-core.json",
      "events-activity.json",
      "events-agent-activity.json",
      "events-anomaly-extension.json",
    ];
    const events = files.flatMap((file) => load(file).events);
    expect(events.map((event: { sequence: number }) => event.sequence)).toEqual(
      Array.from({ length: 15 }, (_, i) => i + 1),
    );
    for (const event of events)
      expect(liveEvent.safeParse(event).success).toBe(true);
    for (const forbidden of ["head", "diagnosticTail"])
      expect(containsKey(events, forbidden)).toBe(false);
  });
  it("computes snapshot ordering and rejects interleaved live events", () => {
    const f = load("snapshot-restart.json");
    for (const frame of f.snapshotFrames)
      expect(snapshotFrame.safeParse(frame).success).toBe(true);
    expect(validateSnapshotTranscript(f.validTranscript)).toBe(true);
    expect(
      validateSnapshotTranscript(load("snapshot-interleaved.json").frames),
    ).toBe(false);
    const live = load("snapshot-live-sequence.json");
    expect(validateSnapshotTranscript(live.valid)).toBe(true);
    expect(validateSnapshotTranscript(live.duplicate)).toBe(false);
    expect(validateSnapshotTranscript(live.regressing)).toBe(false);
    expect(f.restart).toMatchObject({
      cursorReplay: "unsupported",
      clientAction: "new-handshake-snapshot-no-replay",
    });
  });
});
