import { WebSocket } from "ws";

export function sendFrame(socket: WebSocket, frame: unknown): boolean {
  const text = JSON.stringify(frame);
  const bytes = Buffer.byteLength(text);
  if (bytes > 1024 * 1024 || socket.bufferedAmount + bytes > 4 * 1024 * 1024) {
    socket.close(1013, "observation buffer exceeded");
    return false;
  }
  socket.send(text);
  return true;
}
