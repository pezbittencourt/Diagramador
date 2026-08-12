import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../domain/defaultDocument";
import { parseDocument, serializeDocument } from "./documentCodec";
import { PAGE_BREAK_CHARACTER, plainTextToStoryContent, storyToPlainText } from "../domain/textStory";
import { composeStory } from "../layout/pagination";
import { DeterministicTextMeasurer } from "../layout/textMeasurement";

describe("document persistence codec", () => {
  it("round-trips project data used by open and save", () => {
    const source = createDefaultDocument();
    const document = {
      ...source,
      title: "Meu Livro",
      pageSetup: {
        ...source.pageSetup,
        preset: "custom" as const,
        width: 148,
        height: 210,
        margins: { top: 18, bottom: 22, inner: 25, outer: 17 },
        bleed: { top: 3, bottom: 3, inner: 4, outer: 5 },
        mirroredMargins: false,
      },
      viewSettings: { showMargins: false, showBleed: true },
      numbering: {
        ...source.numbering,
        ranges: [
          {
            id: "body",
            fromPhysicalIndex: 4,
            logicalStart: 1,
            format: "roman-lower" as const,
          },
        ],
        display: {
          defaultVisible: false,
          logicalRanges: [{ from: 3 }],
          hiddenLogicalNumbers: [7, 25],
          hiddenPageIds: ["chapter-opening"],
        },
        placement: {
          vertical: "top" as const,
          horizontal: "inner" as const,
          mirrorOnFacingPages: true,
        },
      },
    };

    const parsed = parseDocument(serializeDocument(document));

    expect(parsed.title).toBe("Meu Livro");
    expect(parsed.pageSetup).toEqual(document.pageSetup);
    expect(parsed.viewSettings).toEqual(document.viewSettings);
    expect(parsed.numbering).toEqual(document.numbering);
    expect(parsed.pages).toEqual(document.pages);
    expect(parsed.stories).toEqual(document.stories);
    expect(parsed.styles).toEqual(document.styles);
    expect(parsed.assets).toEqual(document.assets);
  });

  it("fills defensive defaults for version 0.1 documents", () => {
    const legacy = createDefaultDocument();
    const { preset: _preset, ...legacySetup } = legacy.pageSetup;
    const legacyPayload = {
      ...legacy,
      pageSetup: legacySetup,
      viewSettings: undefined,
      numbering: {
        ...legacy.numbering,
        display: {
          defaultVisible: false,
          logicalRanges: [{ from: 3, to: 180 }],
          hiddenPageIds: [],
        },
      },
    };
    const legacyParagraph = legacyPayload.stories[0].content.content[0];
    if (legacyParagraph.type === "paragraph") {
      delete (legacyParagraph as { id?: string }).id;
    }

    const parsed = parseDocument(JSON.stringify(legacyPayload));

    expect(parsed.pageSetup.preset).toBe("A5");
    expect(parsed.viewSettings).toEqual({ showMargins: true, showBleed: true });
    expect(parsed.numbering.display.hiddenLogicalNumbers).toEqual([]);
    expect(parsed.stories[0].content.content[0].id).toEqual(expect.any(String));
  });

  it("rejects incompatible schema versions clearly", () => {
    const document = createDefaultDocument();

    expect(() =>
      parseDocument(JSON.stringify({ ...document, schemaVersion: 99 })),
    ).toThrow(/Vers.o de documento incompat.vel/i);
  });

  it("I: persists story paragraphs and semantic manual page breaks", () => {
    const document = createDefaultDocument();
    document.stories[0].content = plainTextToStoryContent(
      `Antes${PAGE_BREAK_CHARACTER}Depois`,
    );
    const parsed = parseDocument(serializeDocument(document));
    expect(storyToPlainText(parsed.stories[0].content)).toBe(
      `Antes${PAGE_BREAK_CHARACTER}Depois`,
    );
    expect(parsed.stories[0].content.content.some((block) => block.type === "pageBreak")).toBe(true);
  });

  it("reconstructs the same pagination after save and open", () => {
    const document = createDefaultDocument();
    document.stories[0].content = plainTextToStoryContent("persistência ".repeat(3200));
    const compose = (source: typeof document) => composeStory({
      storyId: source.stories[0].id,
      content: source.stories[0].content,
      pageSetup: source.pageSetup,
      styles: source.styles,
      measurer: new DeterministicTextMeasurer(),
    });
    const before = compose(document);
    const opened = parseDocument(serializeDocument(document));
    const after = compose(opened);
    expect(after.pages.length).toBe(before.pages.length);
    expect(after.sourceLength).toBe(before.sourceLength);
  });
});
