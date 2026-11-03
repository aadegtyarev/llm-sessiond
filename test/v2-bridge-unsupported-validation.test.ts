import { describe, expect, it } from "vitest";
import { dispatch, requests } from "./v2-bridge-unsupported-test-support.js";

describe("strict unsupported bridge requests", () => {
  it("rejects each valid unsupported request without an ACK or side effect", () => {
    for (const frame of requests)
      for (const opened of [false, true]) {
        const { socket, result } = dispatch(frame, opened);
        if (frame.type === "callback.result") {
          expect(result).toBe("closed");
          expect(socket.close).toHaveBeenCalledWith(
            1008,
            "callback responses are unsupported",
          );
        } else {
          expect(result).toBe("continue");
          expect(
            JSON.parse(socket.send.mock.calls[0]![0] as string),
          ).toMatchObject({
            type: "request.failed",
            requestId: frame.requestId,
          });
        }
        expect(
          socket.send.mock.calls.some(
            ([text]) => JSON.parse(text as string).type === "request.succeeded",
          ),
        ).toBe(false);
      }
  });
});
