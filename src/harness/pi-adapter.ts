import type { HarnessAdapter, ProcessProvider } from "../core/ports.js";
import type { SessionRecord } from "../core/types.js";
import { startPiProcess } from "./pi-startup.js";
import type { PiRpcProcess } from "./pi-process.js";

export class PiHarnessAdapter implements HarnessAdapter {
  readonly id = "pi" as const;
  constructor(
    private readonly provider: ProcessProvider,
    private readonly executable = process.env.PI_EXECUTABLE ?? "pi",
  ) {}
  async launch(
    session: SessionRecord,
    nativeId?: string,
  ): Promise<PiRpcProcess> {
    const args = [
      "--mode",
      "rpc",
      ...(nativeId ? ["--session", nativeId] : []),
    ];
    const child = this.provider.launch(this.executable, args, session.cwd);
    try {
      return await startPiProcess(child, nativeId);
    } catch {
      child.kill("SIGKILL");
      throw new Error("PI_STARTUP_FAILED");
    }
  }
}
