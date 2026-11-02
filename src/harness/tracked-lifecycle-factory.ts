import type { HarnessAdapter } from "../core/adapter-contracts.js";
import type {
  LifecycleExecution,
  LifecycleExecutionFactory,
} from "../core/lifecycle-execution.js";

export class TrackedLifecycleFactory implements LifecycleExecutionFactory {
  private readonly outstanding = new Set<LifecycleExecution>();
  constructor(
    private readonly bindings: Array<{
      adapter: HarnessAdapter;
      factory: LifecycleExecutionFactory;
    }>,
  ) {}
  create(adapter: HarnessAdapter): LifecycleExecution {
    const binding = this.bindings.find((item) => item.adapter === adapter);
    if (!binding) throw new Error("UNSUPPORTED_ADAPTER");
    const execution = new TrackedExecution(
      binding.factory.create(adapter),
      () => this.outstanding.delete(execution),
    );
    this.outstanding.add(execution);
    return execution;
  }
  assertStopped(): void {
    if (this.outstanding.size > 0)
      throw new Error("RUNTIME_SHUTDOWN_UNCONFIRMED");
  }
}
class TrackedExecution implements LifecycleExecution {
  private pending: Promise<void> | undefined;
  private confirmed = false;
  constructor(
    private readonly execution: LifecycleExecution,
    private readonly onStopped: () => void,
  ) {}
  get inputs() {
    return this.execution.inputs;
  }
  get liveStatus() {
    return this.execution.liveStatus;
  }
  get modelCatalog() {
    return this.execution.modelCatalog;
  }
  get effortCatalog() {
    return this.execution.effortCatalog;
  }
  launch(input: Parameters<LifecycleExecution["launch"]>[0]) {
    return this.execution.launch(input);
  }
  resume(input: Parameters<LifecycleExecution["resume"]>[0]) {
    return this.execution.resume(input);
  }
  stop(): Promise<void> {
    if (this.confirmed) return Promise.resolve();
    if (this.pending) return this.pending;
    const attempt = this.execution.stop().then(
      () => {
        this.confirmed = true;
        this.onStopped();
      },
      () => {
        throw new Error("EXECUTION_STOP_UNCONFIRMED");
      },
    );
    this.pending = attempt;
    void attempt.catch(() => {
      if (this.pending === attempt) this.pending = undefined;
    });
    return attempt;
  }
}
