import type { ProcessProvider } from "../core/ports.js";
import type { HarnessPort, HarnessEvent } from "../interfaces/runtime-ports.js";
import { createPiDescriptor, type PiProfile } from "./pi-descriptor.js";
export type { PiProfile } from "./pi-descriptor.js";
import { stopPiProcess, type PiProcess } from "./pi-process.js";
import { startPiSession } from "./pi-start-session.js";
import { submitPiInput } from "./pi-input.js";
import { cancelPiInput } from "./pi-input-cancel.js";
import { readPiCommands, readPiEfforts, readPiModels } from "./pi-queries.js";
import { readPiStatus } from "./pi-status-query.js";
import { changePiEffort } from "./pi-effort-change.js";

export class PiHarnessPort implements HarnessPort {
  readonly descriptor;
  private readonly owned = new Map<string, PiProcess>();
  constructor(
    private readonly provider: ProcessProvider,
    private readonly executable = process.env.PI_EXECUTABLE ?? "pi",
    private readonly profile: PiProfile = "v2",
    private readonly readinessTimeoutMs = 15_000,
    private readonly stopTimeoutMs = 2_000,
    private readonly rpcTimeoutMs = 15_000,
  ) {
    this.descriptor = createPiDescriptor(profile);
  }
  start(
    config: Parameters<HarnessPort["start"]>[0],
    emit: (event: HarnessEvent) => void,
    beforeWrite: () => boolean,
  ) {
    return startPiSession({
      provider: this.provider,
      executable: this.executable,
      profile: this.profile,
      readinessTimeoutMs: this.readinessTimeoutMs,
      stopTimeoutMs: this.stopTimeoutMs,
      rpcTimeoutMs: this.rpcTimeoutMs,
      owned: this.owned,
      config,
      emit,
      beforeWrite,
    });
  }
  submit(
    sessionId: string,
    input: Parameters<HarnessPort["submit"]>[1],
    beforeWrite: () => boolean,
  ) {
    return submitPiInput(this.current(sessionId), input, beforeWrite);
  }
  cancel(sessionId: string, inputId: string, beforeWrite: () => boolean) {
    return cancelPiInput(this.current(sessionId), inputId, beforeWrite);
  }
  async stop(sessionId: string) {
    const process = this.owned.get(sessionId);
    if (!process) throw new Error("Harness unavailable");
    const confirmed = await stopPiProcess(process, this.stopTimeoutMs);
    if (confirmed && this.owned.get(sessionId) === process)
      this.owned.delete(sessionId);
    return confirmed
      ? { kind: "confirmed" as const }
      : { kind: "unknown" as const };
  }
  async shutdown() {
    const owned = [...this.owned.entries()];
    const results = await Promise.all(
      owned.map(([, process]) => stopPiProcess(process, this.stopTimeoutMs)),
    );
    owned.forEach(([id, process], index) => {
      if (results[index] && this.owned.get(id) === process)
        this.owned.delete(id);
    });
    return results.every(Boolean)
      ? { kind: "confirmed" as const }
      : { kind: "unknown" as const };
  }
  status(sessionId: string) {
    return readPiStatus(this.current(sessionId));
  }
  models(sessionId: string) {
    return readPiModels(this.current(sessionId));
  }
  efforts(sessionId: string) {
    return readPiEfforts(this.current(sessionId));
  }
  commands(sessionId: string) {
    return readPiCommands(this.current(sessionId));
  }
  changeEffort(sessionId: string, level: string, beforeWrite: () => boolean) {
    return changePiEffort(this.current(sessionId), level, beforeWrite);
  }
  private current(id: string): PiProcess {
    const process = this.owned.get(id);
    if (!process || process.stopRequested || process.stopped)
      throw new Error("Harness unavailable");
    return process;
  }
}
