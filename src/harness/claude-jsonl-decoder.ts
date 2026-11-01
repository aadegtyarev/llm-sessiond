const MAX_RECORD_BYTES = 1024 * 1024;

export class ClaudeJsonlDecoder {
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private pending = "";
  push(chunk: Buffer): string[] {
    try {
      this.pending += this.decoder.decode(chunk, { stream: true });
    } catch {
      throw new Error("CLAUDE_STARTUP_FAILED");
    }
    const lines: string[] = [];
    let newline: number;
    while ((newline = this.pending.indexOf("\n")) >= 0) {
      let line = this.pending.slice(0, newline);
      this.pending = this.pending.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      this.checkSize(line);
      lines.push(line);
    }
    this.checkSize(this.pending);
    return lines;
  }
  finish(): void {
    try {
      this.pending += this.decoder.decode();
    } catch {
      throw new Error("CLAUDE_STARTUP_FAILED");
    }
    if (this.pending.length > 0) throw new Error("CLAUDE_STARTUP_FAILED");
  }
  private checkSize(text: string): void {
    if (Buffer.byteLength(text) > MAX_RECORD_BYTES)
      throw new Error("CLAUDE_STARTUP_FAILED");
  }
}
