import { describe, expect, it } from "vitest";
import { ControlPlaneError } from "../src/core/control-plane-error.js";
import { validateInput } from "../src/core/input-validation.js";

const maxBytes = 20 * 1024 * 1024;
const image = (data: string) => ({ mimeType: "image/png", data });
function expectInvalidInput(data: string | string[]): void {
  try {
    const images = (Array.isArray(data) ? data : [data]).map(image);
    validateInput({ text: "", images });
    throw new Error("expected invalid image data");
  } catch (error) {
    expect(error).toBeInstanceOf(ControlPlaneError);
    expect(error).not.toBeInstanceOf(RangeError);
    expect(error).toMatchObject({ code: "INVALID_INPUT" });
  }
}

describe("generic image input validation", () => {
  it("accepts canonical data at the exact 20 MiB decoded limit", () => {
    const data = Buffer.alloc(maxBytes).toString("base64");
    expect(validateInput({ text: "", images: [image(data)] })).toEqual({
      text: "",
      images: [image(data)],
    });
  });
  it("rejects one byte over the decoded limit without leaking RangeError", () => {
    const data = Buffer.alloc(maxBytes + 1).toString("base64");
    expectInvalidInput(data);
  });
  it("enforces the decoded aggregate across images", () => {
    const half = Buffer.alloc(maxBytes / 2).toString("base64");
    expect(
      validateInput({ text: "", images: [image(half), image(half)] }).images,
    ).toHaveLength(2);
    const over = Buffer.alloc(maxBytes / 2 + 1).toString("base64");
    expectInvalidInput([half, over]);
  });
  it.each(["AQ=", "A===", "AB==", "A Q==", "A*=="])(
    "rejects malformed canonical Base64 %s",
    (data) => expectInvalidInput(data),
  );
  it("preserves empty image data semantics", () => {
    expect(validateInput({ text: "", images: [image("")] })).toEqual({
      text: "",
      images: [image("")],
    });
  });
});
