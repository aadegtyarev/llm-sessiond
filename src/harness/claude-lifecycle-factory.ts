import type { HarnessAdapter } from "../core/adapter-contracts.js";
import type {
  LifecycleExecution,
  LifecycleExecutionFactory,
} from "../core/lifecycle-execution.js";
import type { ProcessProvider } from "../core/ports.js";
import { ClaudeLifecycleAdapter } from "./claude-lifecycle-adapter.js";
import { ClaudeLifecycleExecution } from "./claude-lifecycle-execution.js";
import type { ChildTerminator } from "../process/child-stop.js";

export class ClaudeLifecycleExecutionFactory implements LifecycleExecutionFactory {
  constructor(
    readonly adapter: ClaudeLifecycleAdapter,
    private readonly provider: ProcessProvider,
    private readonly executable = process.env.CLAUDE_EXECUTABLE ?? "claude",
    private readonly readinessTimeoutMs = 15_000,
    private readonly id: () => string = () => crypto.randomUUID(),
    private readonly terminate?: ChildTerminator,
  ) {}
  create(adapter: HarnessAdapter): LifecycleExecution {
    if (adapter !== this.adapter) throw new Error("UNSUPPORTED_ADAPTER");
    return new ClaudeLifecycleExecution(
      this.adapter,
      this.provider,
      this.executable,
      this.readinessTimeoutMs,
      this.id,
      this.terminate,
    );
  }
}
