import { WebSocket } from "ws";

export function sendFrame(socket: WebSocket, frame: unknown): boolean {
  const text = JSON.stringify(frame);
  const bytes = Buffer.byteLength(text);
  if (bytes > 1024 * 1024 || socket.bufferedAmount + bytes > 4 * 1024 * 1024) {
    try {
      socket.close(1013, "observation buffer exceeded");
    } catch {
      return terminate(socket);
    }
    return false;
  }
  try {
    socket.send(text);
    return true;
  } catch {
    return terminate(socket);
  }
}
function terminate(socket: WebSocket): false {
  try {
    socket.terminate();
  } catch {
    return false;
  }
  return false;
}
