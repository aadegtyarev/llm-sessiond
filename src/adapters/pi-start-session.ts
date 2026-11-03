import type { ProcessProvider } from "../core/ports.js";
import type {
  HarnessEvent,
  HarnessSessionConfig,
  StartOutcome,
} from "../interfaces/runtime-ports.js";
import {
  launchPiProcess,
  stopPiProcess,
  type PiProcess,
} from "./pi-process.js";
import { observePiProcess } from "./pi-event-observer.js";
import { piCheckpoint, readPiCheckpoint, readyPi } from "./pi-readiness.js";
import type { PiProfile } from "./pi-descriptor.js";

export async function startPiSession(input: {
  provider: ProcessProvider;
  executable: string;
  profile: PiProfile;
  readinessTimeoutMs: number;
  stopTimeoutMs: number;
  rpcTimeoutMs: number;
  owned: Map<string, PiProcess>;
  config: HarnessSessionConfig;
  emit: (event: HarnessEvent) => void;
  beforeWrite: () => boolean;
}): Promise<StartOutcome> {
  const { config, owned } = input;
  if (owned.has(config.sessionId) || !input.beforeWrite())
    return { kind: "uncertain" };
  const expected =
    config.checkpoint === undefined
      ? undefined
      : readPiCheckpoint(config.checkpoint);
  if (config.checkpoint !== undefined && !expected) return { kind: "failed" };
  if (
    config.nativeSessionId !== undefined &&
    expected !== config.nativeSessionId
  )
    return { kind: "failed" };
  let process: PiProcess | undefined;
  try {
    process = await launchPiProcess(
      input.provider,
      input.executable,
      config.cwd,
      expected ? ["--session", expected] : [],
      input.rpcTimeoutMs,
      input.beforeWrite,
    );
    if (!process) return { kind: "uncertain" };
    owned.set(config.sessionId, process);
    if (!input.beforeWrite()) {
      if (await stopPiProcess(process, input.stopTimeoutMs))
        owned.delete(config.sessionId);
      return { kind: "uncertain" };
    }
    observePiProcess(config.sessionId, process, input.profile, input.emit);
    const nativeSessionId = await readyPi(
      process,
      expected,
      input.readinessTimeoutMs,
    );
    process.ready = true;
    return {
      kind: "started",
      nativeSessionId,
      checkpoint: piCheckpoint(nativeSessionId),
    };
  } catch {
    if (process) {
      if (!(await stopPiProcess(process, input.stopTimeoutMs)))
        return { kind: "uncertain" };
      owned.delete(config.sessionId);
    }
    return { kind: "failed" };
  }
}
