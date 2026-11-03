import { afterEach, describe, expect, it } from "vitest";
import { cleanupPiTests, setupPi } from "./pi-native-core-support.js";

afterEach(cleanupPiTests);
describe("Pi profile-specific event projection", () => {
  it("preserves v1 activity and notifications while v2 is text-only", async () => {
    const { cwd, runtime } = await setupPi("v1");
    const events: Array<Record<string, unknown>> = [];
    runtime.subscribe((event) =>
      events.push(event as unknown as Record<string, unknown>),
    );
    const session = await runtime.create({ cwd });
    await runtime.submit(session.id, "turn");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events.map((event) => event.kind)).toContain("output");
    expect(events.map((event) => event.kind)).toContain("activity");
    expect(events.map((event) => event.kind)).toContain("notification");
    expect(JSON.stringify(events)).not.toContain("private");
  });
});
