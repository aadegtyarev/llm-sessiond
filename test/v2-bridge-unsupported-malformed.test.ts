import { describe, expect, it } from "vitest";
import { dispatch, requests } from "./v2-bridge-unsupported-test-support.js";

describe("malformed unsupported bridge requests", () => {
  it("closes malformed known frames instead of classifying them", () => {
    for (const frame of requests) {
      const missing = { ...frame };
      const required =
        frame.type === "control.request"
          ? "timeoutMs"
          : frame.type === "control.cancel"
            ? "targetRequestId"
            : frame.type === "guard.set"
              ? "contextId"
              : frame.type === "callback.bind"
                ? "sessionId"
                : frame.type === "callback.unbind"
                  ? "bindingId"
                  : "callbackId";
      delete missing[required];
      const malformed = [
        { ...frame, type: [frame.type] },
        { ...frame, unexpected: true },
        missing,
        { ...frame, apiVersion: ["v2"] },
        ...(typeof frame.requestId === "string"
          ? [{ ...frame, requestId: "" }]
          : []),
        ...(frame.type === "control.request"
          ? [
              { ...frame, operation: [frame.operation] },
              { ...frame, operation: "unsupported" },
              { ...frame, timeoutMs: "1000" },
              { ...frame, guard: { contextId: "ctx", generation: "0" } },
              { ...frame, guard: { contextId: "", generation: 0 } },
            ]
          : []),
        ...(frame.type === "control.cancel"
          ? [{ ...frame, targetRequestId: "" }]
          : []),
        ...(frame.type === "callback.bind"
          ? [{ ...frame, sessionId: "" }]
          : []),
        ...(frame.type === "callback.result" &&
        (frame.result as Record<string, unknown>).kind === "file"
          ? [
              {
                ...frame,
                result: { ...(frame.result as object), delivered: 2 },
              },
            ]
          : []),
      ];
      for (const variant of malformed)
        for (const opened of [false, true]) {
          const { socket, result } = dispatch(variant, opened);
          expect(result).toBe("closed");
          expect(socket.close).toHaveBeenCalledWith(1002, expect.any(String));
          expect(socket.send).not.toHaveBeenCalled();
        }
    }
  });

  it("closes open frames with unknown callback names", () => {
    const { socket, result } = dispatch(
      {
        apiVersion: "v2",
        type: "client.open",
        requestId: "o",
        protocolRevision: 1,
        callbacks: ["unknown"],
      },
      false,
    );
    expect(result).toBe("closed");
    expect(socket.send).not.toHaveBeenCalled();
  });
});
