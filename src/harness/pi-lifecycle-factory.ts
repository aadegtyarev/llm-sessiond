import type { HarnessAdapter } from "../core/adapter-contracts.js";
import type {
  LifecycleExecution,
  LifecycleExecutionFactory,
} from "../core/lifecycle-execution.js";
import type { ProcessProvider } from "../core/ports.js";
import { PiLifecycleAdapter } from "./pi-lifecycle-adapter.js";
import { PiLifecycleExecution } from "./pi-lifecycle-execution.js";

export class PiLifecycleExecutionFactory implements LifecycleExecutionFactory {
  constructor(
    readonly adapter: PiLifecycleAdapter,
    private readonly provider: ProcessProvider,
    private readonly executable = process.env.PI_EXECUTABLE ?? "pi",
    private readonly readinessTimeoutMs = 15_000,
  ) {}
  create(adapter: HarnessAdapter): LifecycleExecution {
    if (adapter !== this.adapter) throw new Error("UNSUPPORTED_ADAPTER");
    return new PiLifecycleExecution(
      this.adapter,
      this.provider,
      this.executable,
      this.readinessTimeoutMs,
    );
  }
}
