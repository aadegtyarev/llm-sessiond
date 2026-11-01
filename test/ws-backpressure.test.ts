import { describe, expect, it } from "vitest";
import {
  exceedsWebSocketBufferLimit,
  WS_BUFFER_LIMIT,
  WS_FRAME_OVERHEAD,
} from "../src/api/ws-backpressure.js";

describe("WebSocket backpressure", () => {
  it("closes before the next send can exceed the bounded queue", () => {
    expect(
      exceedsWebSocketBufferLimit(WS_BUFFER_LIMIT - WS_FRAME_OVERHEAD - 1, 1),
    ).toBe(false);
    expect(
      exceedsWebSocketBufferLimit(WS_BUFFER_LIMIT - WS_FRAME_OVERHEAD, 1),
    ).toBe(true);
    expect(exceedsWebSocketBufferLimit(0, WS_BUFFER_LIMIT + 1)).toBe(true);
  });
});
