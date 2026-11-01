import { expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

it("allows a session ID spelling as an input ID but rejects input reuse only", async () => {
  let emit!: (event: unknown) => void;
  let writes = 0;
  const { manager } = configured(
    {
      submit: async () => {
        writes++;
        return { kind: "accepted" };
      },
      cancel: async () => ({ kind: "accepted" }),
      subscribe: (listener) => {
        emit = listener;
        return () => {};
      },
    },
    ["session-1", "session-1", "session-1", "Session-1"],
  );
  const row = await manager.create({ cwd: process.cwd() });
  const sameSpelling = await manager.inputs.submit(row.id, { text: "first" });
  expect(sameSpelling.inputId).toBe(row.id);
  emit({ inputId: sameSpelling.inputId, state: "completed" });
  await expect(
    manager.inputs.submit(row.id, { text: "repeat" }),
  ).rejects.toMatchObject({ code: "SESSION_ID_COLLISION" });
  const caseDistinct = await manager.inputs.submit(row.id, { text: "case" });
  expect(caseDistinct.inputId).toBe("Session-1");
  expect(writes).toBe(2);
  await manager.stop(row.id);
});
