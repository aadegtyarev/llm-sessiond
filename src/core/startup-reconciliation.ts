import { validateCheckpoint } from "./adapter-checkpoint.js";
import { SafeValidationError } from "./generic-json.js";
import type { HarnessRegistry } from "./adapter-registry.js";
import type { SessionRepository } from "../persistence/session-repository.js";

export interface ReconciliationReport { changed: string[]; preserved: Array<{ id: string; reason: string }> }
export function reconcileStartup(repository: SessionRepository, registry: HarnessRegistry): ReconciliationReport {
  const report: ReconciliationReport = { changed: [], preserved: [] };
  for (const session of repository.list()) {
    if (session.status === "running" || session.status === "starting") {
      repository.setStatus(session.id, "stopped", session.failureReason ?? null, session.failedAt ?? null);
      report.changed.push(session.id);
      continue;
    }
    if (session.status !== "failed") continue;
    try {
      const adapter = registry.resolve(session.harnessId);
      if (!session.adapterState || !adapter.isResumable?.(validateCheckpoint(session.adapterState, adapter))) continue;
      repository.setStatus(session.id, "stopped", session.failureReason ?? null, session.failedAt ?? null);
      report.changed.push(session.id);
    } catch (error) {
      const reason = error instanceof SafeValidationError ? error.code : "CHECKPOINT_UNAVAILABLE";
      report.preserved.push({ id: session.id, reason });
    }
  }
  return report;
}
