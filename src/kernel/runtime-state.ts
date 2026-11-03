import type {
  HarnessPort,
  InputState,
  SessionEvent,
  SessionRecord,
  SessionStore,
} from "../interfaces/runtime-ports.js";

export interface RuntimeState {
  store: Pick<
    SessionStore,
    "read" | "list" | "write" | "delete" | "assertOwner"
  >;
  ports: Map<
    string,
    { port: HarnessPort; descriptor: HarnessPort["descriptor"] }
  >;
  defaultHarnessId: string;
  makeId: () => string;
  sessions: Map<string, SessionRecord>;
  inputs: Map<string, InputState>;
  listeners: Set<(event: SessionEvent) => void>;
  locks: Map<string, Promise<void>>;
  stopping: Set<string>;
  resuming: Set<string>;
  sources: Map<string, number>;
  cancelAccepted: Set<string>;
  cancelPending: Set<string>;
  stopOperations: Map<string, Promise<boolean>>;
  revision: number;
  closing: boolean;
  shutdownPromise?: Promise<boolean>;
}
