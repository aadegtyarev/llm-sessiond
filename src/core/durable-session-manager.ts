import { randomUUID } from "node:crypto";
import type { HarnessRegistry } from "./adapter-registry.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import { PerSessionLock } from "./per-session-lock.js";
import { SafeSessionStore } from "./safe-session-store.js";
import { resumeSession } from "./session-resume.js";
import { DurableSessionManagerRead } from "./session-read-metadata.js";
import { deleteSession } from "./session-stop-delete.js";
import {
  assertCurrentOwner,
  resolveAdapter,
} from "./session-lifecycle-support.js";
import type { LifecycleExecutionFactory } from "./lifecycle-execution.js";
import type {
  DurableSession,
  OwnerGeneration,
} from "../persistence/session-record.js";
import type { JsonValue } from "./generic-json.js";
import type { DurableSessionStore } from "./session-manager-store.js";
import { createManagedSession } from "./create-session-command.js";
import { DurableInputRuntime } from "./durable-input-runtime.js";
import { DurableInputState } from "./durable-input-state.js";
import { readDurableLiveStatus } from "./durable-live-status.js";
import {
  stopOwnedSession,
  shutdownOwnedSessionsWithIntent,
} from "./durable-manager-lifecycle-operations.js";
export type { DurableSessionStore } from "./session-manager-store.js";
export class DurableSessionManager {
  private readonly context: DurableManagerContext;
  private readonly inputState = new DurableInputState();
  readonly inputs: DurableInputRuntime;
  private readonly locks = new PerSessionLock();
  constructor(
    store: DurableSessionStore,
    registry: HarnessRegistry,
    factory: LifecycleExecutionFactory,
    owner: OwnerGeneration,
    private readonly id: () => string = randomUUID,
    stopTimeoutMs = 30_000,
    inputTimeoutMs = 5_000,
  ) {
    this.context = {
      store: new SafeSessionStore(store),
      registry,
      factory,
      owner,
      owned: new Map(),
      pending: new Map(),
      lifecycleIntents: new Map(),
      stopTimeoutMs,
      inputState: this.inputState,
    };
    this.inputs = new DurableInputRuntime(
      this.context,
      this.locks,
      this.id,
      inputTimeoutMs,
    );
  }
  list(): DurableSession[] {
    return this.context.store.list();
  }
  get(id: string): DurableSession {
    return DurableSessionManagerRead.get(this.context.store, id);
  }
  descriptor(id: string) {
    return resolveAdapter(this.context.registry, id).descriptor;
  }
  readLiveStatus(id: string) {
    return readDurableLiveStatus(this.context, id);
  }
  create(input: {
    cwd: string;
    harnessId?: string;
    name?: string;
    options?: JsonValue;
  }): Promise<DurableSession> {
    return createManagedSession(this.context, this.locks, this.id, input);
  }
  rename(id: string, name: string | null): Promise<DurableSession> {
    return this.locks.run(id, async () => {
      assertCurrentOwner(this.context);
      return DurableSessionManagerRead.rename(this.context.store, id, name);
    });
  }
  delete(id: string): Promise<void> {
    return this.locks.run(id, async () => deleteSession(this.context, id));
  }
  stop(id: string): Promise<DurableSession> {
    return stopOwnedSession(this.context, this.locks, id);
  }
  resume(id: string): Promise<DurableSession> {
    return this.locks.run(id, () => resumeSession(this.context, id));
  }
  shutdownOwned(): Promise<void> {
    return shutdownOwnedSessionsWithIntent(this.context, this.locks);
  }
}
