export const WS_BUFFER_LIMIT = 256 * 1024;
export function exceedsWebSocketBufferLimit(
  bufferedAmount: number,
  nextMessageBytes: number,
): boolean {
  return bufferedAmount + nextMessageBytes > WS_BUFFER_LIMIT;
}
