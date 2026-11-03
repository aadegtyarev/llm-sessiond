import { describe, expect, it, vi } from "vitest";
import { V2BridgeHub } from "../src/api/v2-bridge-hub.js";
import type { DurableSessionManager } from "../src/core/durable-session-manager.js";
import type { ManagedSessionEventRecord } from "../src/core/managed-session-events.js";

function peer() {
  return { bufferedAmount: 0, send: vi.fn(), close: vi.fn() };
}
describe("v2 bridge snapshot boundary", () => {
  it("sends sync snapshots before live at each exact boundary, with revision gaps", () => {
    let boundary = 0;
    let publish: ((record: ManagedSessionEventRecord) => void) | undefined;
    const manager = {
      events: {
        snapshot: () => ({
          afterRevision: boundary,
          sessions: [
            {
              id: "s",
              harnessId: "test",
              cwd: "/tmp",
              status: "running" as const,
            },
          ],
        }),
        subscribe: (listener: typeof publish) => {
          publish = listener;
          return vi.fn();
        },
      },
    } as unknown as DurableSessionManager;
    const hub = new V2BridgeHub(manager, "boot", () => {});
    const record = (revision: number): ManagedSessionEventRecord => ({
      revision,
      event: {
        kind: "session.changed",
        session: {
          id: `s${revision}`,
          harnessId: "test",
          cwd: "/tmp",
          status: "running",
        },
      },
    });
    const first = peer();
    hub.open(first as never, () => {});
    publish?.(record(1));
    boundary = 2;
    const second = peer();
    hub.open(second as never, () => {});
    const initial = second.send.mock.calls.map(([text]) =>
      JSON.parse(text as string),
    );
    expect(initial.map((frame) => frame.type)).toEqual([
      "snapshot.begin",
      "snapshot.session",
      "snapshot.end",
    ]);
    expect(initial[0]).toMatchObject({ afterSequence: 2 });
    publish?.(record(2));
    expect(second.send).toHaveBeenCalledTimes(3);
    publish?.(record(3));
    publish?.(record(5));
    const live = second.send.mock.calls
      .slice(3)
      .map(([text]) => JSON.parse(text as string));
    expect(live.map((frame) => frame.sequence)).toEqual([3, 5]);
    boundary = 7;
    const idle = peer();
    hub.open(idle as never, () => {});
    expect(idle.send).toHaveBeenCalledTimes(3);
    expect(JSON.parse(idle.send.mock.calls[0]![0] as string)).toMatchObject({
      afterSequence: 7,
    });
  });
});
