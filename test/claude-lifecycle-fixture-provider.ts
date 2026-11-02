import { spawn } from "node:child_process";
import path from "node:path";
import type { ProcessProvider } from "../src/core/ports.js";

export function claudeFixtureProvider(
  mode: string | (() => string),
  calls: string[],
): ProcessProvider {
  return {
    launch: (_exe, args, cwd) => {
      calls.push(args.join(" "));
      return spawn(
        process.execPath,
        [path.resolve("test/fixtures/fake-claude-lifecycle.mjs"), ...args],
        {
          cwd,
          env: {
            ...process.env,
            CLAUDE_V2_MODE: typeof mode === "string" ? mode : mode(),
          },
          stdio: ["pipe", "pipe", "ignore"],
        },
      );
    },
  };
}
