import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { children, cleanupPiTests, setupPi } from "./pi-native-core-support.js";

afterEach(cleanupPiTests);
describe("Pi native process boundary fences", () => {
  it("checks the spawn fence before launch and after child ownership", async () => {
    const { cwd, port, launchArgs, journal } = await setupPi();
    const config = { sessionId: "fenced", harnessId: "pi", cwd };
    expect(
      await port.start(
        config,
        () => {},
        () => false,
      ),
    ).toEqual({ kind: "uncertain" });
    expect(launchArgs).toHaveLength(0);
    let checks = 0;
    expect(
      await port.start(
        config,
        () => {},
        () => ++checks <= 2,
      ),
    ).toEqual({ kind: "uncertain" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(launchArgs).toHaveLength(1);
    expect(await readFile(journal, "utf8").catch(() => "")).toBe("");
    expect(
      children.at(-1)?.exitCode !== null ||
        children.at(-1)?.signalCode !== null,
    ).toBe(true);
  });
});
