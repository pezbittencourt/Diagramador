import { describe, expect, it } from "vitest";
import { parsePhysicalPageRange } from "./pageRange";

describe("physical PDF page ranges", () => {
  it("converts a single physical page to a zero-based index", () => {
    expect(parsePhysicalPageRange("15", 30)).toEqual([14]);
  });

  it("accepts comma-separated pages and intervals", () => {
    expect(parsePhysicalPageRange("1-3, 8, 11-13", 20)).toEqual([
      0, 1, 2, 7, 10, 11, 12,
    ]);
  });

  it.each(["2–4", "2—4", " 2 - 4 "])("accepts supported separator form %s", (input) => {
    expect(parsePhysicalPageRange(input, 10)).toEqual([1, 2, 3]);
  });

  it("returns unique pages in physical order for duplicates and overlaps", () => {
    expect(parsePhysicalPageRange("8, 3-6, 1, 5-8, 3", 10)).toEqual([
      0, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("accepts a one-page interval", () => {
    expect(parsePhysicalPageRange("4-4", 8)).toEqual([3]);
  });

  it("rejects an empty selection", () => {
    expect(() => parsePhysicalPageRange("   ", 10)).toThrow(/ao menos uma página física/i);
  });

  it("rejects page zero", () => {
    expect(() => parsePhysicalPageRange("0", 10)).toThrow(/página física 0.*começa em 1/i);
  });

  it("rejects an inverted interval", () => {
    expect(() => parsePhysicalPageRange("7-3", 10)).toThrow(/7–3.*invertido/i);
  });

  it.each(["capítulo", "1..3", "1 3", "1,,3", "-2", "2-"])(
    "rejects invalid syntax %s",
    (input) => {
      expect(() => parsePhysicalPageRange(input, 10)).toThrow(/item|válido/i);
    },
  );

  it("rejects a page above the physical page count", () => {
    expect(() => parsePhysicalPageRange("10-11", 10)).toThrow(/11.*fora do documento.*10/i);
  });

  it.each([0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid total page count %s",
    (totalPages) => {
      expect(() => parsePhysicalPageRange("1", totalPages)).toThrow(/inteiro positivo/i);
    },
  );
});
