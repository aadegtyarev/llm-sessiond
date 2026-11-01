import { describe, expect, it } from "vitest";
import { ClaudeJsonlDecoder } from "../src/harness/claude-jsonl-decoder.js";

const MAX = 1024 * 1024;
function payload(size: number): string {
  const prefix = '{"x":"';
  const suffix = '"}';
  return prefix + "a".repeat(size - prefix.length - suffix.length) + suffix;
}
describe("Claude JSONL framing", () => {
  it("preserves fragmented UTF-8 and handles LF/CRLF records", () => {
    const decoder = new ClaudeJsonlDecoder();
    const bytes = Buffer.from('{"text":"é"}\r\n{"type":"ok"}\n');
    const split = bytes.indexOf(Buffer.from("é")) + 1;
    expect(decoder.push(bytes.subarray(0, split))).toEqual([]);
    expect(decoder.push(bytes.subarray(split))).toEqual([
      '{"text":"é"}',
      '{"type":"ok"}',
    ]);
    decoder.finish();
  });
  it("accepts exact-limit LF and CRLF records independent of chunk boundaries", () => {
    const exact = payload(MAX);
    const lf = new ClaudeJsonlDecoder();
    expect(lf.push(Buffer.from(`${exact}\n`))).toEqual([exact]);
    lf.finish();
    const crlf = new ClaudeJsonlDecoder();
    expect(crlf.push(Buffer.from(`${exact}\r\n`))).toEqual([exact]);
    crlf.finish();
    const split = new ClaudeJsonlDecoder();
    expect(split.push(Buffer.from(`${exact}\r`))).toEqual([]);
    expect(split.push(Buffer.from("\n"))).toEqual([exact]);
    split.finish();
  });
  it("rejects over-limit records and incomplete delimiter boundaries", () => {
    const over = payload(MAX + 1);
    for (const chunks of [[`${over}\n`], [`${over}\r`, "\n"]]) {
      const decoder = new ClaudeJsonlDecoder();
      expect(() =>
        chunks.forEach((chunk) => decoder.push(Buffer.from(chunk))),
      ).toThrow("CLAUDE_STARTUP_FAILED");
    }
    const continuation = new ClaudeJsonlDecoder();
    continuation.push(Buffer.from(`${payload(MAX)}\r`));
    expect(() => continuation.push(Buffer.from("x\n"))).toThrow(
      "CLAUDE_STARTUP_FAILED",
    );
    const multipleCr = new ClaudeJsonlDecoder();
    expect(() => multipleCr.push(Buffer.from(`${payload(MAX)}\r\r\n`))).toThrow(
      "CLAUDE_STARTUP_FAILED",
    );
    const eof = new ClaudeJsonlDecoder();
    eof.push(Buffer.from(`${payload(MAX)}\r`));
    expect(() => eof.finish()).toThrow("CLAUDE_STARTUP_FAILED");
  });
  it("rejects invalid and truncated UTF-8 and oversized records", () => {
    const invalid = new ClaudeJsonlDecoder();
    expect(() => invalid.push(Buffer.from([0xff]))).toThrow(
      "CLAUDE_STARTUP_FAILED",
    );
    const truncated = new ClaudeJsonlDecoder();
    truncated.push(Buffer.from([0x7b, 0xc3]));
    expect(() => truncated.finish()).toThrow("CLAUDE_STARTUP_FAILED");
    const oversized = new ClaudeJsonlDecoder();
    expect(() => oversized.push(Buffer.alloc(1024 * 1024 + 1, 0x61))).toThrow(
      "CLAUDE_STARTUP_FAILED",
    );
  });
});
