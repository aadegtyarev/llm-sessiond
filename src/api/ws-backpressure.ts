export const WS_BUFFER_LIMIT = 256 * 1024;
export const WS_FRAME_OVERHEAD = 10;
export function exceedsWebSocketBufferLimit(
  bufferedAmount: number,
  nextMessageBytes: number,
): boolean {
  return (
    bufferedAmount + nextMessageBytes + WS_FRAME_OVERHEAD > WS_BUFFER_LIMIT
  );
}
