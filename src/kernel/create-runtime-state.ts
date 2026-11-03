import type { HarnessPort, SessionStore } from "../interfaces/runtime-ports.js";
import { snapshotDescriptor } from "./harness-descriptor.js";
import type { RuntimeState } from "./runtime-state.js";

export function createRuntimeState(
  store: SessionStore,
  ports: HarnessPort | HarnessPort[],
  makeId: () => string,
  defaultHarnessId?: string,
): RuntimeState {
  const storeMethods = {
    read: store.read.bind(store),
    list: store.list.bind(store),
    write: store.write.bind(store),
    delete: store.delete.bind(store),
    assertOwner: store.assertOwner.bind(store),
  };
  const captured = new Map<
    string,
    { port: HarnessPort; descriptor: HarnessPort["descriptor"] }
  >();
  for (const source of Array.isArray(ports) ? ports : [ports]) {
    const descriptor = snapshotDescriptor(source.descriptor);
    if (captured.has(descriptor.id)) throw new Error("Duplicate harness");
    captured.set(descriptor.id, {
      descriptor,
      port: bindPort(source, descriptor),
    });
  }
  const defaultId = defaultHarnessId ?? captured.keys().next().value;
  if (!defaultId || !captured.has(defaultId))
    throw new Error("Default harness unavailable");
  return {
    store: storeMethods,
    ports: captured,
    defaultHarnessId: defaultId,
    makeId,
    sessions: new Map(),
    inputs: new Map(),
    listeners: new Set(),
    locks: new Map(),
    stopping: new Set(),
    resuming: new Set(),
    sources: new Map(),
    cancelAccepted: new Set(),
    cancelPending: new Set(),
    stopOperations: new Map(),
    revision: 0,
    closing: false,
  };
}

function bindPort(
  source: HarnessPort,
  descriptor: HarnessPort["descriptor"],
): HarnessPort {
  const start = source.start.bind(source),
    submit = source.submit.bind(source);
  const stop = source.stop.bind(source),
    shutdown = source.shutdown.bind(source);
  const cancel = source.cancel,
    status = source.status,
    models = source.models;
  const efforts = source.efforts,
    commands = source.commands,
    changeEffort = source.changeEffort;
  return {
    descriptor,
    start,
    submit,
    stop,
    shutdown,
    ...(cancel ? { cancel: cancel.bind(source) } : {}),
    ...(status ? { status: status.bind(source) } : {}),
    ...(models ? { models: models.bind(source) } : {}),
    ...(efforts ? { efforts: efforts.bind(source) } : {}),
    ...(commands ? { commands: commands.bind(source) } : {}),
    ...(changeEffort ? { changeEffort: changeEffort.bind(source) } : {}),
  };
}
