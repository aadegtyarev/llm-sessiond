import { randomUUID } from "node:crypto";
import type { HarnessRegistry } from "./adapter-registry.js";
import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableManagerContext } from "./durable-manager-context.js";
import { PerSessionLock } from "./per-session-lock.js";
import { createSession } from "./session-launch.js";
import { resumeSession } from "./session-resume.js";
import { DurableSessionManagerRead } from "./session-read-metadata.js";
import { validateLifecycleCwd } from "./lifecycle-cwd-validation.js";
import {
  deleteSession,
  shutdownOwnedExecution,
  stopSession,
} from "./session-stop-delete.js";
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
import { validateSessionId } from "./durable-validation.js";
export type { DurableSessionStore } from "./session-manager-store.js";
export class DurableSessionManager {
  private readonly context: DurableManagerContext;
  private readonly locks = new PerSessionLock();
  constructor(
    store: DurableSessionStore,
    registry: HarnessRegistry,
    factory: LifecycleExecutionFactory,
    owner: OwnerGeneration,
    private readonly id: () => string = randomUUID,
    stopTimeoutMs = 30_000,
  ) {
    this.context = {
      store,
      registry,
      factory,
      owner,
      owned: new Map(),
      stopTimeoutMs,
    };
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
  async create(input: {
    cwd: string;
    harnessId?: string;
    name?: string;
    options?: JsonValue;
  }): Promise<DurableSession> {
    const cwd = await validateLifecycleCwd(input.cwd);
    const id = this.id();
    try {
      validateSessionId(id);
    } catch {
      throw new ControlPlaneError("INVALID_SESSION_ID");
    }
    return this.locks.run(id, () =>
      createSession(this.context, id, { ...input, cwd }),
    );
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
    return this.locks.run(id, async () => {
      await stopSession(this.context, id);
      return this.get(id);
    });
  }
  resume(id: string): Promise<DurableSession> {
    return this.locks.run(id, () => resumeSession(this.context, id));
  }
  async shutdownOwned(): Promise<void> {
    await Promise.all(
      [...this.context.owned.keys()].map((id) =>
        this.locks.run(id, () => shutdownOwnedExecution(this.context, id)),
      ),
    );
  }
}
