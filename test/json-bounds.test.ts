import { describe, expect, it } from "vitest";
import { parseBoundedJson, validateJson } from "../src/core/json-bounds.js";

describe("generic JSON bounds and privacy", () => {
  it("accepts options within 8192 bytes and depth five", () => {
    expect(parseBoundedJson('{"layout":"wide"}', 8192, 5)).toEqual({ layout: "wide" });
  });
  it("rejects oversized, deep, secret-key, and malformed JSON", () => {
    expect(() => validateJson({ value: "x".repeat(8192) }, 8192, 5)).toThrow("JSON_SIZE_LIMIT");
    expect(() => validateJson({ a: { b: { c: { d: { e: { f: 1 } } } } } }, 8192, 5)).toThrow("JSON_DEPTH_LIMIT");
    expect(() => validateJson({ apiKey: "hidden" }, 8192, 5)).toThrow("SECRET_KEY_FORBIDDEN");
    expect(() => parseBoundedJson("{", 8192, 5)).toThrow("INVALID_JSON");
  });
});
