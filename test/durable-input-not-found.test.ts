import { expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

it("reports missing session before payload or current-input validation", async () => {
  const { manager } = configured({
    submit: async () => ({ kind: "accepted" }),
    cancel: async () => ({ kind: "accepted" }),
  });
  await expect(manager.inputs.submit("missing", null)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    manager.inputs.cancel("missing", "bad id"),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(manager.inputs.cancelCurrent("missing")).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
