import { describe, expect, it } from "vitest";
import { ClaudeJsonlDecoder } from "../src/harness/claude-jsonl-decoder.js";

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
