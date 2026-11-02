import { describe, expect, it } from "vitest";
import { createTrackedPiImageManager } from "./pi-tracked-image-manager.js";

const image = { mimeType: "image/png", data: "AQID" };

describe("Pi durable image input", () => {
  it("submits exact text and canonical image once with only RPC correlation on wire", async () => {
    const { manager, children } = createTrackedPiImageManager();
    try {
      const session = await manager.create({ cwd: "/tmp" });
      const result = await manager.inputs.submit(session.id, {
        text: "caption",
        images: [image],
      });
      expect(result).toEqual({ inputId: "opaque-2", resumed: false });
      const prompts = children[0]!.writes.filter(
        (request) => request.type === "prompt",
      );
      expect(prompts).toEqual([
        {
          type: "prompt",
          id: expect.any(String),
          message: "caption",
          images: [{ type: "image", ...image }],
          streamingBehavior: "steer",
        },
      ]);
      expect(prompts[0]).not.toHaveProperty("inputId");
    } finally {
      await manager.shutdownOwned();
    }
  });
  it("resumes the exact stopped Pi session and submits image once", async () => {
    const { manager, children, launches } = createTrackedPiImageManager();
    try {
      const session = await manager.create({ cwd: "/tmp" });
      await manager.stop(session.id);
      const result = await manager.inputs.submit(session.id, {
        text: "resumed caption",
        images: [image],
      });
      expect(result).toEqual({ inputId: "opaque-2", resumed: true });
      expect(launches[1]).toEqual([
        "--mode",
        "rpc",
        "--session",
        "native-test",
      ]);
      expect(
        children[0]!.writes.filter((request) => request.type === "prompt"),
      ).toEqual([]);
      const prompts = children[1]!.writes.filter(
        (request) => request.type === "prompt",
      );
      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toMatchObject({
        message: "resumed caption",
        images: [{ type: "image", ...image }],
        streamingBehavior: "steer",
      });
      expect(prompts[0]).not.toHaveProperty("inputId");
    } finally {
      await manager.shutdownOwned();
    }
  });
});
