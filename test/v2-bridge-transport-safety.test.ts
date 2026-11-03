import { describe, expect, it, vi } from "vitest";
import { V2BridgeHub } from "../src/api/v2-bridge-hub.js";
import { sendFrame } from "../src/api/v2-bridge-peer.js";
import type { DurableSessionManager } from "../src/core/durable-session-manager.js";
import type { ManagedSessionEventRecord } from "../src/core/managed-session-events.js";

function socket() {
  return { bufferedAmount: 0, send: vi.fn(), close: vi.fn() };
}
describe("v2 bridge transport safety", () => {
  it("shares instance sequence, detaches one peer, and closes peers on feed loss", () => {
    let listener: ((record: ManagedSessionEventRecord) => void) | undefined;
    let unavailable: (() => void) | undefined;
    const manager = {
      events: {
        snapshot: () => ({ afterRevision: 0, sessions: [] }),
        subscribe: (next: typeof listener, lost: typeof unavailable) => {
          listener = next;
          unavailable = lost;
          return vi.fn();
        },
      },
    } as unknown as DurableSessionManager;
    const hub = new V2BridgeHub(manager, "boot-id", () => {});
    const first = socket();
    const second = socket();
    const detach = hub.open(first as never, () => {});
    hub.open(second as never, () => {});
    const event = (revision: number): ManagedSessionEventRecord => ({
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
    listener?.(event(1));
    expect(
      JSON.parse(first.send.mock.calls.at(-1)![0] as string),
    ).toMatchObject({ sequence: 1 });
    expect(
      JSON.parse(second.send.mock.calls.at(-1)![0] as string),
    ).toMatchObject({ sequence: 1 });
    detach();
    listener?.(event(2));
    expect(first.send).toHaveBeenCalledTimes(3);
    expect(
      JSON.parse(second.send.mock.calls.at(-1)![0] as string),
    ).toMatchObject({ sequence: 2 });
    unavailable?.();
    expect(second.close).toHaveBeenCalledWith(1011, "observation unavailable");
  });
  it("disconnects rather than exceeding the websocket queue", () => {
    const slow = { ...socket(), bufferedAmount: 4 * 1024 * 1024 };
    expect(sendFrame(slow as never, { type: "event" })).toBe(false);
    expect(slow.close).toHaveBeenCalledWith(
      1013,
      "observation buffer exceeded",
    );
  });
});
