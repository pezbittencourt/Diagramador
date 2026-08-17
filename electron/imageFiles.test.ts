import { describe, expect, it } from "vitest";
import { detectImageMimeType } from "./imageFiles";

describe("native image validation", () => {
  it.each([
    ["PNG", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"],
    ["JPEG", Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"],
    ["WebP", Buffer.from("RIFFxxxxWEBP", "ascii"), "image/webp"],
  ])("recognizes %s by its binary signature", (_name, bytes, expected) => {
    expect(detectImageMimeType(bytes as Buffer)).toBe(expected);
  });

  it("rejects a renamed or truncated file instead of trusting its extension", () => {
    expect(detectImageMimeType(Buffer.from("not really a picture"))).toBeUndefined();
    expect(detectImageMimeType(Buffer.from([137, 80, 78]))).toBeUndefined();
  });
});
