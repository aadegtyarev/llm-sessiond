import { describe, expect, it } from "vitest";
import { SafeSessionStore } from "../src/core/safe-session-store.js";
import { ControlPlaneError } from "../src/core/control-plane-error.js";
import { SafeValidationError } from "../src/core/generic-json.js";
import type { DurableSessionStore } from "../src/core/session-manager-store.js";
const owner = { token: "t", generation: 1 };
function fault(method: string) {
  const inner = Object.fromEntries(
    [
      "assertOwner",
      "create",
      "get",
      "list",
      "rename",
      "setStatus",
      "updateExecution",
      "delete",
    ].map((name) => [
      name,
      () => {
        throw new Error(`private ${method} message`);
      },
    ]),
  ) as unknown as DurableSessionStore;
  return new SafeSessionStore(inner);
}
describe("bounded durable store boundary", () => {
  it("maps every store and owner operation without raw errors", () => {
    const calls = [
      () => fault("owner").assertOwner(owner),
      () => fault("create").create({} as never),
      () => fault("get").get("x"),
      () => fault("list").list(),
      () => fault("rename").rename("x", null),
      () => fault("status").setStatus("x", "stopped"),
      () =>
        fault("execution").updateExecution("x", undefined, undefined, owner),
      () => fault("delete").delete("x"),
    ];
    for (const call of calls) {
      try {
        call();
        throw new Error("expected failure");
      } catch (error) {
        expect(error).toBeInstanceOf(ControlPlaneError);
        expect((error as Error).message).toBe("durable store operation failed");
        expect((error as Error).message).not.toContain("private");
        expect((error as Error).stack).not.toContain("private");
        expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
      }
    }
  });
  it("preserves safe known owner and missing-row codes", () => {
    const stale = new SafeSessionStore({
      assertOwner: () => {
        throw new SafeValidationError("STALE_OWNER_GENERATION");
      },
    } as unknown as DurableSessionStore);
    expect(() => stale.assertOwner(owner)).toThrowError(
      expect.objectContaining({ code: "STALE_OWNER" }),
    );
    const missing = new SafeSessionStore({
      get: () => {
        throw new SafeValidationError("SESSION_NOT_FOUND");
      },
    } as unknown as DurableSessionStore);
    expect(() => missing.get("gone")).toThrowError(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
  });
});
