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
      viewSettings: {
        ...source.viewSettings,
        showMargins: false,
        showBleed: true,
        viewMode: "single" as const,
      },
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
    expect(parsed.viewSettings).toEqual({
      showMargins: true,
      showBleed: true,
      showRulers: true,
      showCustomGuides: true,
      snapEnabled: true,
      viewMode: "spread",
    });
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

  it("H: salva e abre estilos, vínculos, overrides e formatação inline", () => {
    const document = createDefaultDocument();
    const paragraph = document.stories[0].content.content[0];
    if (paragraph.type !== "paragraph") throw new Error("Fixture inválida.");
    paragraph.attrs.styleId = "quote";
    paragraph.attrs.overrides = { alignment: "right", spaceBeforePt: 12 };
    paragraph.content = [{
      type: "text",
      text: "Trecho rico",
      marks: [
        { type: "bold", attrs: { value: true } },
        { type: "textColor", attrs: { value: "#8b2f2f" } },
      ],
    }];
    document.styles = document.styles.map((style) => style.id === "quote"
      ? { ...style, fontSizePt: 12.5 }
      : style);

    const opened = parseDocument(serializeDocument(document));
    expect(opened.schemaVersion).toBe(3);
    expect(opened.styles.find((style) => style.id === "quote")?.fontSizePt).toBe(12.5);
    expect(opened.stories[0].content.content[0]).toEqual(paragraph);
  });

  it("I: migra um documento 0.4/schema 1 e completa os estilos 0.5", () => {
    const legacy = createDefaultDocument();
    const body = legacy.styles[0] as Partial<(typeof legacy.styles)[number]>;
    delete body.fontWeight;
    delete body.italic;
    delete body.underline;
    delete body.color;
    const payload = {
      ...legacy,
      schemaVersion: 1,
      styles: [body],
    };

    const migrated = parseDocument(JSON.stringify(payload));
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.styles.map((style) => style.id)).toEqual([
      "body", "chapter-title", "subtitle", "quote", "dedication",
    ]);
    expect(migrated.styles[0]).toMatchObject({
      fontWeight: 400,
      italic: false,
      underline: false,
      color: "#222520",
    });
  });

  it("H/Q: mantém asset incorporado, objeto e guia no round-trip do schema 3", () => {
    const document = createDefaultDocument();
    document.assets.push({
      id: "asset-1",
      fileName: "capa.png",
      mimeType: "image/png",
      encoding: "base64",
      data: "aW1hZ2Vt",
      pixelWidth: 1200,
      pixelHeight: 800,
    });
    document.pages[0].objects.push({
      id: "image-1",
      type: "image",
      anchorMode: "page",
      assetId: "asset-1",
      x: -3,
      y: 12.5,
      width: 90,
      height: 60,
      originalAspectRatio: 1.5,
      lockAspectRatio: true,
      zIndex: 4,
    });
    document.guides.push({ id: "guide-1", orientation: "vertical", positionMm: 37.5 });

    expect(parseDocument(serializeDocument(document))).toEqual(document);
  });

  it.each([1, 2])("I: abre schema %i e aplica defaults de objetos e precisão", (schemaVersion) => {
    const current = createDefaultDocument();
    const legacy = {
      ...current,
      schemaVersion,
      guides: undefined,
      viewSettings: { showMargins: false, showBleed: true },
    };
    const opened = parseDocument(JSON.stringify(legacy));
    expect(opened.schemaVersion).toBe(3);
    expect(opened.guides).toEqual([]);
    expect(opened.viewSettings).toMatchObject({
      showMargins: false,
      showRulers: true,
      showCustomGuides: true,
      snapEnabled: true,
      viewMode: "spread",
    });
  });

  it("migrates a schema 2 image placeholder without reading its absolute path", () => {
    const current = createDefaultDocument();
    const legacy = {
      ...current,
      schemaVersion: 2,
      guides: undefined,
      assets: [{
        id: "legacy-asset",
        fileName: "legacy.png",
        mimeType: "image/png",
        path: "C:\\Users\\Legacy\\legacy.png",
      }],
      pages: [{
        id: "legacy-page",
        objects: [{
          id: "legacy-image",
          type: "image",
          assetId: "legacy-asset",
          x: -3,
          y: 8,
          width: 40,
          height: 20,
          zIndex: 0,
        }],
      }],
    };
    const opened = parseDocument(JSON.stringify(legacy));
    expect(opened.assets[0]).toMatchObject({ encoding: "base64", data: "" });
    expect(opened.pages[0].objects[0]).toMatchObject({
      anchorMode: "page",
      originalAspectRatio: 2,
      lockAspectRatio: true,
    });
    expect(JSON.stringify(opened)).not.toContain("Users\\Legacy");
  });

  it("rejects corrupt schema 3 assets with invalid dimensions or encoding", () => {
    const current = createDefaultDocument();
    const corrupt = {
      ...current,
      assets: [{
        id: "bad",
        fileName: "bad.png",
        mimeType: "image/png",
        encoding: "path",
        data: "",
        pixelWidth: 0,
        pixelHeight: 20,
      }],
    };
    expect(() => parseDocument(JSON.stringify(corrupt))).toThrow(/dimensões positivas/i);
  });
});
