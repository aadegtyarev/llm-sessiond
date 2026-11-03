import { vi } from "vitest";
import { handleV2Frame } from "../src/api/v2-bridge-open.js";

const shared = { apiVersion: "v2" };
const control = {
  ...shared,
  type: "control.request",
  requestId: "c",
  sessionId: "Session.A",
  guard: { contextId: "ctx", generation: 0 },
  timeoutMs: 1000,
};
const callback = (result: unknown) => ({
  ...shared,
  type: "callback.result",
  callbackId: "cb",
  bindingId: "binding",
  result,
});
export const requests: Record<string, unknown>[] = [
  { ...control, operation: "reload" },
  { ...control, operation: "command.run", name: "help", remainder: "" },
  {
    ...control,
    operation: "extension",
    namespace: "n",
    version: 1,
    name: "x",
    input: null,
  },
  { ...shared, type: "control.cancel", requestId: "x", targetRequestId: "c" },
  {
    ...shared,
    type: "guard.set",
    requestId: "g",
    contextId: "ctx",
    generation: 1,
    sessionId: null,
  },
  { ...shared, type: "callback.bind", requestId: "b", sessionId: "Session.A" },
  { ...shared, type: "callback.unbind", requestId: "u", bindingId: "binding" },
  callback({ kind: "permission", behavior: "allow" }),
  callback({
    kind: "permission",
    behavior: "deny",
    message: "no",
    interrupt: false,
  }),
  callback({ kind: "file", fileName: "f", delivered: 1, recipients: 1 }),
  callback({
    kind: "failure",
    error: {
      code: "E",
      message: "failed",
      category: "internal",
      outcome: "not-applied",
      reference: "ref",
    },
  }),
];

export function dispatch(frame: unknown, opened: boolean) {
  const socket = { bufferedAmount: 0, send: vi.fn(), close: vi.fn() };
  const result = handleV2Frame(
    socket as never,
    Buffer.from(JSON.stringify(frame)),
    false,
    opened,
    "boot",
    "conn",
  );
  return { socket, result };
}
