import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedInlineStyle } from "../domain/textFormatting";
import type { LayoutSnapshot } from "../layout/layoutTypes";
import {
  collectExportFontRequests,
  validateExportFonts,
  type ExportFontRequest,
} from "./exportReadiness";

function inlineStyle(
  fontFamily: string,
  fontWeight = 400,
  italic = false,
): ResolvedInlineStyle {
  return {
    fontFamily,
    fontSizePt: 11,
    fontWeight,
    italic,
    underline: false,
    color: "#222222",
  };
}

function layoutWithPageStyles(pageStyles: ResolvedInlineStyle[][]): LayoutSnapshot {
  return {
    revision: 1,
    storyId: "font-readiness-story",
    sourceLength: pageStyles.flat().length,
    composeTimeMs: 0,
    pages: pageStyles.map((styles, physicalIndex) => ({
      physicalIndex,
      usedHeightMm: 4,
      fragments: [{
        kind: "paragraph",
        blockId: `block-${physicalIndex}`,
        styleId: "body",
        paragraphStyle: {} as never,
        text: "x".repeat(styles.length),
        from: 0,
        to: styles.length,
        globalFrom: 0,
        globalTo: styles.length,
        lineCount: 1,
        startsParagraph: true,
        endsParagraph: true,
        runs: [],
        lines: [{
          from: 0,
          to: styles.length,
          globalFrom: 0,
          globalTo: styles.length,
          paragraphLineIndex: 0,
          isLastLineOfParagraph: true,
          xMm: 0,
          topMm: 0,
          heightMm: 4,
          availableWidthMm: 100,
          naturalWidthMm: styles.length,
          renderedWidthMm: styles.length,
          wordSpacingMm: 0,
          alignment: "left",
          hyphenated: false,
          runs: styles.map((style, index) => ({
            text: "x",
            from: index,
            to: index + 1,
            globalFrom: index,
            globalTo: index + 1,
            advanceMm: 1,
            style,
          })),
        }],
      }],
    })),
  };
}

interface CreatedFace {
  family: string;
  source: string;
  descriptors?: { style?: string; weight?: string };
}

describe("PDF export font readiness", () => {
  const createdFaces: CreatedFace[] = [];
  let loadFace: (face: CreatedFace) => Promise<unknown>;

  beforeEach(() => {
    createdFaces.length = 0;
    loadFace = async (face) => face;

    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("document", { fonts: { ready: Promise.resolve() } });
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => `probe-${createdFaces.length + 1}`) });
    vi.stubGlobal("FontFace", class {
      readonly family: string;
      readonly source: string;
      readonly descriptors?: { style?: string; weight?: string };

      constructor(
        family: string,
        source: string,
        descriptors?: { style?: string; weight?: string },
      ) {
        this.family = family;
        this.source = source;
        this.descriptors = descriptors;
        createdFaces.push(this);
      }

      load() {
        return loadFace(this);
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("collects and deduplicates regular, bold and italic faces only from selected pages", () => {
    const layout = layoutWithPageStyles([
      [
        inlineStyle("'Minion Pro', serif"),
        inlineStyle("minion pro"),
        inlineStyle("Minion Pro", 700),
        inlineStyle("Minion Pro", 400, true),
        inlineStyle("serif"),
      ],
      [inlineStyle("Page Two Sans")],
    ]);

    expect(collectExportFontRequests(layout, [0])).toEqual([
      { family: "Minion Pro", fontWeight: 400, italic: false },
      { family: "Minion Pro", fontWeight: 700, italic: false },
      { family: "Minion Pro", fontWeight: 400, italic: true },
    ]);
    expect(collectExportFontRequests(layout, [1])).toEqual([
      { family: "Page Two Sans", fontWeight: 400, italic: false },
    ]);
  });

  it("includes the Georgia folio face only when requested and without duplicating it", () => {
    const layout = layoutWithPageStyles([[inlineStyle("Body Sans")]]);

    expect(collectExportFontRequests(layout, [0], false)).toEqual([
      { family: "Body Sans", fontWeight: 400, italic: false },
    ]);
    expect(collectExportFontRequests(layout, [0], true)).toEqual([
      { family: "Body Sans", fontWeight: 400, italic: false },
      { family: "Georgia", fontWeight: 400, italic: false },
    ]);

    const layoutAlreadyUsingGeorgia = layoutWithPageStyles([[inlineStyle("Georgia")]]);
    expect(collectExportFontRequests(layoutAlreadyUsingGeorgia, [0], true)).toEqual([
      { family: "Georgia", fontWeight: 400, italic: false },
    ]);
  });

  it("approves every explicitly resolved local face and preserves its variant descriptors", async () => {
    const requests: ExportFontRequest[] = [
      { family: "Resolved Serif", fontWeight: 400, italic: false },
      { family: "Resolved Serif", fontWeight: 700, italic: true },
    ];

    await expect(validateExportFonts(requests)).resolves.toBeUndefined();
    expect(createdFaces.map(({ source, descriptors }) => ({ source, descriptors }))).toEqual([
      {
        source: 'local("Resolved Serif")',
        descriptors: { style: "normal", weight: "400" },
      },
      {
        source: 'local("Resolved Serif")',
        descriptors: { style: "italic", weight: "700" },
      },
    ]);
  });

  it("rejects a missing face explicitly instead of allowing silent substitution", async () => {
    loadFace = async (face) => {
      if (face.source.includes("Missing Family")) throw new Error("Local face not found");
      return face;
    };

    await expect(validateExportFonts([
      { family: "Resolved Serif", fontWeight: 400, italic: false },
      { family: "Missing Family", fontWeight: 700, italic: true },
    ])).rejects.toThrow(
      /fonte ou variante indisponível: Missing Family \(700, itálico\).*evitar substituição silenciosa/i,
    );
    expect(createdFaces).toHaveLength(2);
  });
});
