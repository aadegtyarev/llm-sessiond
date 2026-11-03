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
    const row = this.get(store, id);
    const snapshot = { ...row };
    if (name === null) delete snapshot.name;
    else snapshot.name = name;
    store.rename(id, name, snapshot);
    return this.get(store, id);
  }
}
