import { describe, expect, it } from "vitest";
import { resolveStateDirectory } from "../src/persistence/state-directory.js";

describe("state directory resolution", () => {
  it("uses environment precedence", () => {
    expect(
      resolveStateDirectory(
        { LLM_SESSIOND_STATE_DIR: "/explicit", XDG_STATE_HOME: "/xdg" },
        "linux",
      ),
    ).toBe("/explicit");
    expect(resolveStateDirectory({ XDG_STATE_HOME: "/xdg" }, "linux")).toBe(
      "/xdg/llm-sessiond",
    );
  });
  it("requires fully-qualified Windows drive or UNC paths", () => {
    expect(
      resolveStateDirectory(
        { LLM_SESSIOND_STATE_DIR: "C:\\state\\service" },
        "win32",
      ),
    ).toBe("C:\\state\\service");
    expect(
      resolveStateDirectory({ LLM_SESSIOND_STATE_DIR: "D:/state" }, "win32"),
    ).toBe("D:\\state");
    expect(() =>
      resolveStateDirectory(
        { LLM_SESSIOND_STATE_DIR: "\\\\?\\C:\\state" },
        "win32",
      ),
    ).toThrow("INVALID_STATE_DIRECTORY");
    expect(
      resolveStateDirectory(
        { LLM_SESSIOND_STATE_DIR: "\\\\server\\share\\state" },
        "win32",
      ),
    ).toBe("\\\\server\\share\\state");
    expect(() =>
      resolveStateDirectory({ LLM_SESSIOND_STATE_DIR: "C:relative" }, "win32"),
    ).toThrow("INVALID_STATE_DIRECTORY");
  });
});
