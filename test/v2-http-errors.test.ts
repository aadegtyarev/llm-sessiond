import { describe, expect, it } from "vitest";
import { load } from "./v2-fixture-support.js";
import {
  validateHttp,
  validateSafeError,
  validateUnsupported,
} from "./v2-http-schema.js";

describe("API v2 strict safe errors", () => {
  it("accepts full uncertain and unsupported error envelopes", () => {
    const f = load("http-edge-cases.json");
    expect(
      validateSafeError(f.partialSubmit.status, f.partialSubmit.error),
    ).toBe(true);
    expect(validateSafeError(f.unsupported.status, f.unsupported.error)).toBe(
      true,
    );
    const unsupported = load("negative-http.json").unsupportedOperation;
    expect(unsupported.status).toBe(409);
    expect(validateUnsupported(unsupported)).toBe(true);
  });
  it("rejects absent required and unknown error fields and bad route bodies", () => {
    const negative = load("negative-http.json");
    for (const item of negative.safeErrors)
      expect(validateSafeError(item.status, item.error)).toBe(false);
    for (const row of negative.routes) expect(validateHttp(row)).toBe(false);
  });
});
