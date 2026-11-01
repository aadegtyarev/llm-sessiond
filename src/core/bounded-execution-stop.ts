import type { DurableManagerContext } from "./durable-manager-context.js";
import type { LifecycleExecution } from "./lifecycle-execution.js";
const TIMEOUT = Symbol("stop-timeout");
export async function boundedExecutionStop(
  context: DurableManagerContext,
  execution: LifecycleExecution,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      execution.stop(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(TIMEOUT), context.stopTimeoutMs);
      }),
    ]);
    return { stopped: true, timedOut: false };
  } catch (error) {
    return { stopped: false, timedOut: error === TIMEOUT };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
