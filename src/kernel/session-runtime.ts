import type {
  HarnessPort,
  ImageInput,
  PublicSession,
  SessionEvent,
  SessionStore,
} from "../interfaces/runtime-ports.js";
import { createRuntimeState } from "./create-runtime-state.js";
import type { RuntimeState } from "./runtime-state.js";
import {
  queryCommands,
  queryEfforts,
  queryModels,
  queryStatus,
} from "./session-query.js";
import { changeEffort } from "./session-effort.js";
import { cancelInput } from "./session-cancel.js";
import { createSession } from "./session-create.js";
import { deleteSession, renameSession } from "./session-metadata.js";
import {
  getSession,
  harnesses as listHarnesses,
  listSessions,
  snapshot,
  subscribe,
} from "./session-observation.js";
import { resumeSession } from "./session-resume.js";
import { shutdownRuntime } from "./session-shutdown.js";
import { stopSession } from "./session-stop.js";
import { submitInput } from "./session-submit.js";

export class SessionRuntime {
  readonly #state: RuntimeState;
  readonly defaultHarnessId: string;
  constructor(
    store: SessionStore,
    harnesses: HarnessPort | HarnessPort[],
    makeId: () => string = () => crypto.randomUUID(),
  ) {
    this.#state = createRuntimeState(store, harnesses, makeId);
    this.defaultHarnessId = this.#state.defaultHarnessId;
  }
  create(config: {
    cwd: string;
    name?: string;
    harnessId?: string;
    adapterOptions?: Record<string, unknown>;
  }): Promise<PublicSession> {
    return createSession(this.#state, config);
  }
  list = async () => listSessions(this.#state);
  get = async (id: string) => getSession(this.#state, id);
  subscribe = (listener: (event: SessionEvent) => void) =>
    subscribe(this.#state, listener);
  snapshot = () => snapshot(this.#state);
  resume = (id: string) => resumeSession(this.#state, id);
  submit(
    id: string,
    text: string,
    images?: ImageInput[],
  ): ReturnType<typeof submitInput> {
    return submitInput(this.#state, id, text, images);
  }
  stop = (id: string) => stopSession(this.#state, id);
  harnesses = () => listHarnesses(this.#state);
  rename(id: string, name: string | null | undefined): Promise<PublicSession> {
    return renameSession(this.#state, id, name);
  }
  delete = async (id: string) => deleteSession(this.#state, id);
  cancel = (id: string, inputId: string) =>
    cancelInput(this.#state, id, inputId);
  cancelCurrent = (id: string) => {
    const active = this.#state.inputs.get(id);
    if (!active) return Promise.reject(new Error("Input not current"));
    return cancelInput(this.#state, id, active.inputId, true);
  };
  status = (id: string) => queryStatus(this.#state, id);
  models = (id: string) => queryModels(this.#state, id);
  efforts = (id: string) => queryEfforts(this.#state, id);
  commands = (id: string) => queryCommands(this.#state, id);
  changeEffort(
    id: string,
    level: string,
  ): Promise<"applied" | "not-applied" | "unknown"> {
    return changeEffort(this.#state, id, level);
  }
  shutdown = () => shutdownRuntime(this.#state);
}
