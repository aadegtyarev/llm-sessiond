import { validateCheckpoint } from "./adapter-checkpoint.js";
import type { AdapterCheckpoint, HarnessAdapter } from "./adapter-contracts.js";
import { SafeValidationError } from "./generic-json.js";
import type { HarnessRegistry } from "./adapter-registry.js";
import type { SessionRepository } from "../persistence/session-repository.js";

export interface ReconciliationReport {
  changed: string[];
  preserved: Array<{ id: string; reason: string }>;
}
export function reconcileStartup(
  repository: SessionRepository,
  registry: HarnessRegistry,
): ReconciliationReport {
  const report: ReconciliationReport = { changed: [], preserved: [] };
  for (const session of repository.list()) {
    let adapter: HarnessAdapter | undefined;
    try {
      adapter = registry.resolve(session.harnessId);
    } catch {
      report.preserved.push({ id: session.id, reason: "UNKNOWN_ADAPTER" });
    }
    let checkpoint: AdapterCheckpoint | undefined;
    if (session.adapterState && adapter) {
      try {
        checkpoint = validateCheckpoint(session.adapterState, adapter);
      } catch (error) {
        const reason =
          error instanceof SafeValidationError
            ? error.code
            : "CHECKPOINT_UNAVAILABLE";
        report.preserved.push({ id: session.id, reason });
      }
    }
    if (session.status === "running" || session.status === "starting") {
      repository.setStatus(
        session.id,
        "stopped",
        session.failureReason ?? null,
        session.failedAt ?? null,
      );
      report.changed.push(session.id);
      continue;
    }
    if (session.status === "failed" && checkpoint && adapter) {
      try {
        if (!adapter.isResumable?.(checkpoint)) continue;
        repository.setStatus(
          session.id,
          "stopped",
          session.failureReason ?? null,
          session.failedAt ?? null,
        );
        report.changed.push(session.id);
      } catch {
        report.preserved.push({
          id: session.id,
          reason: "CHECKPOINT_UNAVAILABLE",
        });
      }
    }
  }
  return report;
}
