import { randomUUID } from "node:crypto";
import { WebSocket, type RawData } from "ws";
import { v2OpenSchema } from "./v2-bridge-schema.js";
import { sendFrame } from "./v2-bridge-peer.js";

export function acceptV2Open(
  socket: WebSocket,
  data: RawData,
  binary: boolean,
  instanceId: string,
  connectionId: string,
): boolean {
  let frame: unknown;
  try {
    if (binary) throw new Error();
    const bytes = Array.isArray(data)
      ? Buffer.concat(data)
      : Buffer.from(data as Uint8Array);
    frame = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    socket.close(1002, "invalid frame");
    return false;
  }
  const parsed = v2OpenSchema.safeParse(frame);
  if (!parsed.success) {
    const row =
      frame && typeof frame === "object" && !Array.isArray(frame)
        ? (frame as Record<string, unknown>)
        : undefined;
    if (
      row?.apiVersion === "v2" &&
      typeof row.requestId === "string" &&
      [
        "control.request",
        "control.cancel",
        "guard.set",
        "callback.bind",
        "callback.unbind",
      ].includes(String(row.type))
    ) {
      sendFailure(
        socket,
        row.requestId,
        "UNSUPPORTED_OPERATION",
        "operation is unsupported",
      );
      return false;
    }
    socket.close(1002, "invalid open");
    return false;
  }
  const open = parsed.data;
  if (open.callbacks.length > 0) {
    sendFailure(
      socket,
      open.requestId,
      "UNSUPPORTED_CALLBACKS",
      "callbacks are unsupported",
    );
    return false;
  }
  sendFrame(socket, {
    apiVersion: "v2",
    type: "request.succeeded",
    requestId: open.requestId,
    result: { protocolRevision: 1, instanceId, connectionId },
  });
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
