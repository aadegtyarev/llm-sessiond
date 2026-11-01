export function decodePiRpcChunk(
  buffer: string,
  chunk: string,
): { buffer: string; records: Record<string, unknown>[]; malformed: boolean } {
  buffer += chunk;
  const records: Record<string, unknown>[] = [];
  while (true) {
    const newline = buffer.indexOf("\n");
    if (newline < 0)
      return {
        buffer,
        records,
        malformed: Buffer.byteLength(buffer) > 1_048_576,
      };
    const line = buffer.slice(0, newline).replace(/\r$/, "");
    buffer = buffer.slice(newline + 1);
    try {
      if (Buffer.byteLength(line) > 1_048_576) throw new Error();
      const record = JSON.parse(line) as Record<string, unknown>;
      if (
        !record ||
        typeof record !== "object" ||
        typeof record.type !== "string"
      )
        throw new Error();
      records.push(record);
    } catch {
      return { buffer: "", records, malformed: true };
    }
  }
}
