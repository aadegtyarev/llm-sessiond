import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { ProcessProvider } from "../core/ports.js";

export class NodeProcessProvider implements ProcessProvider {
  launch(executable: string, args: string[], cwd: string): ChildProcess {
    return spawn(executable, args, {
      cwd,
      shell: false,
      stdio: ["pipe", "pipe", "ignore"],
    });
  }
}
