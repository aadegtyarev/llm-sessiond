import type { LifecycleExecution } from "./lifecycle-execution.js";

export function hasInputSubmitPort(execution: LifecycleExecution): boolean {
  return (
    typeof execution.inputs?.submit === "function" &&
    typeof execution.inputs.subscribe === "function"
  );
}
