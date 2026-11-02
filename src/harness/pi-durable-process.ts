import type { ChildProcess } from "node:child_process";
import type { ProcessProvider } from "../core/ports.js";
import type { ChildTerminator } from "../process/child-stop.js";
import { stopPiChildTracked } from "./pi-durable-child-stop.js";
import { PiDurableRpcLink } from "./pi-durable-rpc-link.js";
import { PiDurableInputPort } from "./pi-durable-input-port.js";
import { startOwnedPi } from "./pi-durable-startup-query.js";
import * as durableReadQueries from "./pi-durable-read-queries.js";
import {
  readDurablePiCommandCatalog as readCommands,
  readDurablePiEffortCatalog as readEffort,
  readDurablePiModelCatalog as readModels,
} from "./pi-durable-read-queries.js";
export class PiDurableProcess {
  readonly inputs = new PiDurableInputPort();
  private child?: ChildProcess;
  private stopped = false;
  private stopRequested = false;
  private nativeSessionId: string | undefined;
  private link?: PiDurableRpcLink;
  private stopping: Promise<void> | undefined;
  constructor(
    private readonly provider: ProcessProvider,
    private readonly executable: string,
    private readonly readinessTimeoutMs: number,
    private readonly terminate?: ChildTerminator,
  ) {}
  async start(
    cwd: string,
    args: string[],
    expectedId?: string,
  ): Promise<string> {
    if (this.child || this.stopped || this.stopRequested)
      throw new Error("EXECUTION_ALREADY_STARTED");
    const child = this.provider.launch(
      this.executable,
      ["--mode", "rpc", ...args],
      cwd,
    );
    this.child = child;
    const link = new PiDurableRpcLink(child);
    this.link = link;
    this.inputs.attach(link);
    const nativeSessionId = await startOwnedPi(
      link,
      expectedId,
      this.readinessTimeoutMs,
      () => this.stop(),
    );
    this.nativeSessionId = nativeSessionId;
    return nativeSessionId;
  }
  async readLiveStatus() {
    const link = this.link;
    if (!link) throw new Error("RPC_UNAVAILABLE");
    return durableReadQueries.readDurablePiLiveStatus(
      link,
      this.nativeSessionId,
      () => this.isQueryCurrent(link),
    );
  }
  readModelCatalog = () =>
    readModels(this.link, (link) => this.isQueryCurrent(link));
  readEffortCatalog = () =>
    readEffort(this.link, (link) => this.isQueryCurrent(link));
  readCommandCatalog = () =>
    readCommands(this.link, (link) => this.isQueryCurrent(link));
  private isQueryCurrent = (link: PiDurableRpcLink): boolean =>
    durableReadQueries.isDurablePiQueryCurrent(
      this.link,
      link,
      this.child,
      this.stopRequested,
      this.stopped,
    );
  stop(): Promise<void> {
    this.stopRequested = true;
    this.inputs.end();
    this.link?.closeAdmission();
    if (this.stopped) return Promise.resolve();
    const child = this.child;
    if (!child) {
      this.stopped = true;
      return Promise.resolve();
    }
    if (this.stopping) return this.stopping;
    return stopPiChildTracked(
      child,
      this.link,
      this.terminate,
      this.stopping,
      (value) => {
        this.stopping = value;
      },
      () => {
        this.stopped = true;
      },
    );
  }
}
