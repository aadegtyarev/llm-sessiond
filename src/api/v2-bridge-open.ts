import { randomUUID } from "node:crypto";
import { WebSocket, type RawData } from "ws";
import { v2OpenSchema } from "./v2-bridge-schema.js";
import { v2UnsupportedRequestSchema } from "./v2-bridge-inbound-schema.js";
import { sendFrame } from "./v2-bridge-peer.js";

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
    const unsupported = rejectUnsupported(socket, frame);
    if (unsupported) return unsupported;
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

function rejectUnsupported(
  socket: WebSocket,
  frame: unknown,
): "continue" | "closed" | undefined {
  const parsed = v2UnsupportedRequestSchema.safeParse(frame);
  if (!parsed.success) return undefined;
  if (parsed.data.type === "callback.result") {
    socket.close(1008, "callback responses are unsupported");
    return "closed";
  }
  sendFailure(
    socket,
    parsed.data.requestId,
    "UNSUPPORTED_OPERATION",
    "operation is unsupported",
  );
  return "continue";
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
