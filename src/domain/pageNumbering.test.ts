import { describe, expect, it } from "vitest";
import type { BookPage, PageNumbering } from "./document";
import { formatLogicalNumber, resolvePageNumber } from "./pageNumbering";

const page = (id: string, pageNumberVisible?: boolean): BookPage => ({ id, pageNumberVisible, objects: [] });
const numbering: PageNumbering = {
  ranges: [{ id: "body", fromPhysicalIndex: 4, logicalStart: 1, format: "arabic" }],
  display: { defaultVisible: false, logicalRanges: [{ from: 3, to: 180 }], hiddenPageIds: ["chapter"] },
  placement: { vertical: "bottom", horizontal: "outer", mirrorOnFacingPages: true },
};

describe("numeração editorial", () => {
  it("mantém índice físico separado do número lógico", () => {
    expect(resolvePageNumber(page("p5"), 4, numbering)).toMatchObject({ physicalNumber: 5, logicalNumber: 1, visible: false });
    expect(resolvePageNumber(page("p7"), 6, numbering)).toMatchObject({ physicalNumber: 7, logicalNumber: 3, visible: true });
  });

  it("oculta uma página sem removê-la da contagem", () => {
    expect(resolvePageNumber(page("chapter"), 7, numbering)).toMatchObject({ logicalNumber: 4, visible: false });
    expect(resolvePageNumber(page("next"), 8, numbering)).toMatchObject({ logicalNumber: 5, visible: true });
  });

  it("permite exceção local explícita", () => {
    expect(resolvePageNumber(page("forced", true), 4, numbering).visible).toBe(true);
  });

  it("formata números romanos", () => {
    expect(formatLogicalNumber(14, "roman-lower")).toBe("xiv");
    expect(formatLogicalNumber(49, "roman-upper")).toBe("XLIX");
  });
});

