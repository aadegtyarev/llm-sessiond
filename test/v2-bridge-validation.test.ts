import { describe, expect, it } from "vitest";
import {
  callbackFrames,
  permissionRequest,
} from "./v2-bridge-callback-schema.js";
import { controlRequest } from "./v2-bridge-control-schema.js";
import { failed, open } from "./v2-bridge-handshake-schema.js";
import {
  validateFrame,
  validateFailureFrame,
  validateRequestPair,
} from "./v2-bridge-frame.js";
import { liveEvent, snapshotFrame } from "./v2-bridge-event-schema.js";
import { load } from "./v2-fixture-support.js";

describe("strict API v2 bridge DTOs", () => {
  it("validates handshake, guard, controls, results, and failures", () => {
    const frames = ["bridge-handshake.json", "bridge-control.json"].flatMap(
      (name) => load(name).frames,
    );
    for (const frame of frames) expect(validateFrame(frame)).toBe(true);
    const requests = frames.filter((frame: { type: string }) =>
      [
        "client.open",
        "guard.set",
        "control.request",
        "control.cancel",
      ].includes(frame.type),
    );
    for (const request of requests) {
      const ack = frames.find(
        (frame: { type: string; requestId?: string }) =>
          frame.type === "request.succeeded" &&
          frame.requestId === request.requestId,
      );
      expect(ack && validateRequestPair(request, ack)).toBe(true);
    }
    expect(
      validateFailureFrame(
        frames.find(
          (frame: { type: string }) => frame.type === "request.failed",
        ),
      ),
    ).toBe(true);
  });
  it("validates callback bind/unbind, request, and result variants", () => {
    const frames = [
      "bridge-callback-routing.json",
      "bridge-file-callback.json",
    ].flatMap((name) => load(name).frames);
    for (const frame of frames) expect(validateFrame(frame)).toBe(true);
    for (const frame of frames.filter((item: { type: string }) =>
      item.type.startsWith("callback."),
    ))
      expect(callbackFrames.safeParse(frame).success).toBe(true);
    const requests = frames.filter((frame: { type: string }) =>
      ["callback.bind", "callback.unbind"].includes(frame.type),
    );
    for (const request of requests) {
      const ack = frames.find(
        (frame: { type: string; requestId?: string }) =>
          frame.type === "request.succeeded" &&
          frame.requestId === request.requestId,
      );
      expect(ack && validateRequestPair(request, ack)).toBe(true);
    }
  });
  it("rejects missing required fields and unknown fields", () => {
    const schemas: Record<
      string,
      { safeParse(value: unknown): { success: boolean } }
    > = {
      open,
      control: controlRequest,
      permission: permissionRequest,
      callback: callbackFrames,
      snapshot: snapshotFrame,
      event: liveEvent,
      failed,
    };
    const cases = ["negative-bridge.json", "negative-events.json"].flatMap(
      (file) => load(file).cases,
    );
    for (const item of cases) {
      expect(schemas[item.schema]).toBeDefined();
      expect(schemas[item.schema]!.safeParse(item.value).success).toBe(false);
    }
  });
});
