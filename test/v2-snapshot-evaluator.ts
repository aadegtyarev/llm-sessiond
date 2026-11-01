import { liveEvent, snapshotFrame } from "./v2-bridge-event-schema.js";
export function validateSnapshotTranscript(frames: unknown[]): boolean {
  let phase: "begin" | "sessions" | "ended" = "begin";
  let id = "";
  let cursor = -1;
  for (const frame of frames) {
    if (phase === "ended") {
      if (
        !liveEvent.safeParse(frame).success ||
        (frame as { sequence: number }).sequence <= cursor
      )
        return false;
      cursor = (frame as { sequence: number }).sequence;
      continue;
    }
    if (!snapshotFrame.safeParse(frame).success) return false;
    const f = frame as { type: string; snapshotId: string };
    if (phase === "begin") {
      if (f.type !== "snapshot.begin") return false;
      id = f.snapshotId;
      cursor = (frame as { afterSequence: number }).afterSequence;
      phase = "sessions";
    } else if (f.type === "snapshot.end" && f.snapshotId === id)
      phase = "ended";
    else if (f.type !== "snapshot.session" || f.snapshotId !== id) return false;
  }
  return phase === "ended";
}
