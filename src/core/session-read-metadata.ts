import { ControlPlaneError } from "./control-plane-error.js";
import type { DurableSessionStore } from "./session-manager-store.js";
import type { DurableSession } from "../persistence/session-record.js";
export class DurableSessionManagerRead {
  static get(store: DurableSessionStore, id: string): DurableSession {
    const row = store.get(id);
    if (!row) throw new ControlPlaneError("NOT_FOUND");
    return row;
  }
  static rename(
    store: DurableSessionStore,
    id: string,
    name: string | null,
  ): DurableSession {
    this.get(store, id);
    store.rename(id, name);
    return this.get(store, id);
  }
}
