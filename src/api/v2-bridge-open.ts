import { randomUUID } from "node:crypto";
import { WebSocket, type RawData } from "ws";
import { v2OpenSchema } from "./v2-bridge-schema.js";
import { sendFrame } from "./v2-bridge-peer.js";

const unsupportedTypes = [
  "control.request",
  "control.cancel",
  "guard.set",
  "callback.bind",
  "callback.unbind",
  "callback.result",
];

export function handleV2Frame(
  socket: WebSocket,
  data: RawData,
  binary: boolean,
  opened: boolean,
  instanceId: string,
  connectionId: string,
): "opened" | "continue" | "closed" {
  let frame: unknown;
  try {
    if (binary) throw new Error();
    const bytes = Array.isArray(data)
      ? Buffer.concat(data)
      : Buffer.from(data as Uint8Array);
    frame = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    socket.close(1002, "invalid frame");
    return "closed";
  }
  const parsed = v2OpenSchema.safeParse(frame);
  if (opened || !parsed.success) {
    if (rejectUnsupported(socket, frame)) return "continue";
    socket.close(1002, opened ? "unexpected frame" : "invalid open");
    return "closed";
  }
  const open = parsed.data;
  if (open.callbacks.length > 0) {
    sendFailure(
      socket,
      open.requestId,
      "UNSUPPORTED_CALLBACKS",
      "callbacks are unsupported",
    );
    return "continue";
  }
  if (
    !sendFrame(socket, {
      apiVersion: "v2",
      type: "request.succeeded",
      requestId: open.requestId,
      result: { protocolRevision: 1, instanceId, connectionId },
    })
  )
    return "closed";
  return "opened";
}

function rejectUnsupported(socket: WebSocket, frame: unknown): boolean {
  const row =
    frame && typeof frame === "object" && !Array.isArray(frame)
      ? (frame as Record<string, unknown>)
      : undefined;
  if (
    row?.apiVersion !== "v2" ||
    typeof row.requestId !== "string" ||
    !unsupportedTypes.includes(String(row.type))
  )
    return false;
  sendFailure(
    socket,
    row.requestId,
    "UNSUPPORTED_OPERATION",
    "operation is unsupported",
  );
  return true;
}

function sendFailure(
  socket: WebSocket,
  requestId: string,
  code: string,
  message: string,
): void {
  sendFrame(socket, {
    apiVersion: "v2",
    type: "request.failed",
    requestId,
    error: {
      code,
      message,
      category: "unsupported",
      outcome: "not-applied",
      reference: randomUUID(),
    },
  });
}
