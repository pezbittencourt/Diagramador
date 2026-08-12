import { describe, expect, it } from "vitest";
import type { BookPage, PageNumbering } from "./document";
import {
  formatLogicalNumber,
  resolvePageNumber,
  resolvePageNumberPlacement,
} from "./pageNumbering";

const page = (id: string, pageNumberVisible?: boolean): BookPage => ({
  id,
  pageNumberVisible,
  objects: [],
});

const numbering: PageNumbering = {
  ranges: [{ id: "body", fromPhysicalIndex: 4, logicalStart: 1, format: "arabic" }],
  display: {
    defaultVisible: false,
    logicalRanges: [{ from: 3, to: 180 }],
    hiddenLogicalNumbers: [],
    hiddenPageIds: ["chapter"],
  },
  placement: { vertical: "bottom", horizontal: "outer", mirrorOnFacingPages: true },
};

describe("editorial numbering", () => {
  it("keeps physical index separate from logical number", () => {
    expect(resolvePageNumber(page("p4"), 3, numbering)).toMatchObject({
      physicalNumber: 4,
      logicalNumber: null,
      visible: false,
    });
    expect(resolvePageNumber(page("p5"), 4, numbering)).toMatchObject({
      physicalNumber: 5,
      logicalNumber: 1,
      visible: false,
    });
    expect(resolvePageNumber(page("p6"), 5, numbering)).toMatchObject({
      physicalNumber: 6,
      logicalNumber: 2,
      visible: false,
    });
    expect(resolvePageNumber(page("p10"), 9, numbering)).toMatchObject({
      physicalNumber: 10,
      logicalNumber: 6,
      visible: true,
    });
  });

  it("shows folios only inside the configured editorial range", () => {
    expect(resolvePageNumber(page("logical-1"), 4, numbering).visible).toBe(false);
    expect(resolvePageNumber(page("logical-2"), 5, numbering).visible).toBe(false);
    expect(resolvePageNumber(page("logical-3"), 6, numbering).visible).toBe(true);
  });

  it("supports an optional final logical display number", () => {
    const limited: PageNumbering = {
      ...numbering,
      display: { ...numbering.display, logicalRanges: [{ from: 3, to: 10 }] },
    };

    expect(resolvePageNumber(page("logical-10"), 13, limited)).toMatchObject({
      logicalNumber: 10,
      visible: true,
    });
    expect(resolvePageNumber(page("logical-11"), 14, limited)).toMatchObject({
      logicalNumber: 11,
      visible: false,
    });
  });

  it("hides logical exceptions without removing them from the count", () => {
    const withHiddenLogical: PageNumbering = {
      ...numbering,
      display: { ...numbering.display, hiddenLogicalNumbers: [7] },
    };

    expect(resolvePageNumber(page("chapter"), 10, withHiddenLogical)).toMatchObject({
      logicalNumber: 7,
      visible: false,
    });
    expect(resolvePageNumber(page("next"), 11, withHiddenLogical)).toMatchObject({
      logicalNumber: 8,
      visible: true,
    });
    expect(resolvePageNumber(page("chapter"), 7, numbering)).toMatchObject({
      logicalNumber: 4,
      visible: false,
    });
  });

  it("allows an explicit per-page override", () => {
    expect(resolvePageNumber(page("forced", true), 4, numbering).visible).toBe(true);
  });

  it("formats roman numerals", () => {
    expect(formatLogicalNumber(14, "roman-lower")).toBe("xiv");
    expect(formatLogicalNumber(49, "roman-upper")).toBe("XLIX");
  });

  it("mirrors inner and outer placement between left and right pages", () => {
    expect(resolvePageNumberPlacement(1, numbering.placement)).toMatchObject({ horizontal: "left" });
    expect(resolvePageNumberPlacement(2, numbering.placement)).toMatchObject({ horizontal: "right" });
    expect(resolvePageNumberPlacement(1, { ...numbering.placement, horizontal: "inner" })).toMatchObject({ horizontal: "right" });
    expect(resolvePageNumberPlacement(2, { ...numbering.placement, horizontal: "center" })).toMatchObject({ horizontal: "center" });
  });
});
