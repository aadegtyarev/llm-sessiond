import { randomUUID } from "node:crypto";
import type { HarnessRegistry } from "./adapter-registry.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import { PerSessionLock } from "./per-session-lock.js";
import { resumeSession } from "./session-resume.js";
import { DurableSessionManagerRead } from "./session-read-metadata.js";
import { deleteSession } from "./session-stop-delete.js";
import {
  assertCurrentOwner,
  resolveAdapter,
} from "./session-lifecycle-support.js";
import type { LifecycleExecutionFactory } from "./lifecycle-execution.js";
import type { DurableSession } from "../persistence/session-record.js";
import type { JsonValue } from "./generic-json.js";
import type { DurableSessionStore } from "./session-manager-store.js";
import { createManagedSession } from "./create-session-command.js";
import { DurableInputRuntime } from "./durable-input-runtime.js";
import { createManagerObservation } from "./durable-manager-observation.js";
import type { ManagedSessionEventFeed } from "./managed-session-events.js";
import * as q from "./durable-session-queries.js";
import {
  stopOwnedSession,
  shutdownOwnedSessionsWithIntent,
} from "./durable-manager-lifecycle-operations.js";
export type { DurableSessionStore } from "./session-manager-store.js";
export class DurableSessionManager {
  private readonly context: DurableManagerContext;
  readonly inputs: DurableInputRuntime;
  readonly events: ManagedSessionEventFeed;
  private readonly locks = new PerSessionLock();
  constructor(
    store: DurableSessionStore,
    registry: HarnessRegistry,
    factory: LifecycleExecutionFactory,
    owner: import("../persistence/session-record.js").OwnerGeneration,
    private readonly id: () => string = randomUUID,
    stopTimeoutMs = 30_000,
    inputTimeoutMs = 5_000,
  ) {
    const observation = createManagerObservation(
      store,
      registry,
      factory,
      owner,
      stopTimeoutMs,
    );
    this.context = observation.context;
    this.events = {
      subscribe: observation.events.subscribe.bind(observation.events),
      snapshot: observation.events.snapshot.bind(observation.events),
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
  descriptor = (id: string) =>
    resolveAdapter(this.context.registry, id).descriptor;
  readLiveStatus = (id: string) => q.readDurableLiveStatus(this.context, id);
  readModelCatalog = (id: string) => q.readModelCatalog(this.context, id);
  readEffortCatalog = (id: string) => q.readEffortCatalog(this.context, id);
  readCommandCatalog = (id: string) => q.readCommandCatalog(this.context, id);
  changeEffort = (id: string, level: unknown) =>
    q.changeEffort(this.context, id, level);
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
  closeAdmission = () => (this.context.executionAdmissionClosed = true);
  shutdownOwned(): Promise<void> {
    return shutdownOwnedSessionsWithIntent(this.context, this.locks);
  }
}
