import { ControlPlaneError } from "./control-plane-error.js";
import { EffortChangeError } from "./effort-change-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import { hasLifecycleIntent } from "./durable-lifecycle-intents.js";
import { dispatchDurableEffortChange } from "./durable-effort-change-dispatch.js";

const EFFORT_CHANGE_TIMEOUT_MS = 30_000;

export function changeDurableEffort(
  manager: DurableManagerContext,
  id: string,
  level: unknown,
): Promise<{ outcome: "applied" }> {
  if (typeof level !== "string")
    return Promise.reject(
      new EffortChangeError("INVALID_EFFORT", "not-applied"),
    );
  if (hasLifecycleIntent(manager, id))
    return Promise.reject(
      new EffortChangeError("SESSION_UNAVAILABLE", "not-applied"),
    );
  const deadline = Date.now() + EFFORT_CHANGE_TIMEOUT_MS;
  let active = true;
  let mutationPossible = false;
  let settled = false;
  let timer: NodeJS.Timeout;
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown, result?: { outcome: "applied" }) => {
      if (settled) return;
      settled = true;
      active = false;
      clearTimeout(timer);
      if (error !== undefined)
        reject(safeFailure(error, mutationPossible, deadline));
      else resolve(result!);
    };
    timer = setTimeout(() => {
      finish(
        new EffortChangeError(
          "OPERATION_TIMEOUT",
          mutationPossible ? "unknown" : "not-applied",
        ),
      );
    }, EFFORT_CHANGE_TIMEOUT_MS);
    void dispatchDurableEffortChange(
      manager,
      id,
      level,
      deadline,
      () => active,
      () => {
        mutationPossible = true;
      },
      () => mutationPossible,
    ).then(
      (result) => finish(undefined, result),
      (error: unknown) => finish(error),
    );
  });
}
function safeFailure(
  error: unknown,
  mutationPossible: boolean,
  deadline: number,
): EffortChangeError {
  const code =
    Date.now() >= deadline
      ? "OPERATION_TIMEOUT"
      : error instanceof ControlPlaneError
        ? error.code
        : "OPERATION_FAILED";
  const outcome =
    mutationPossible ||
    (error instanceof EffortChangeError && error.outcome === "unknown")
      ? "unknown"
      : "not-applied";
  return new EffortChangeError(code, outcome);
}
