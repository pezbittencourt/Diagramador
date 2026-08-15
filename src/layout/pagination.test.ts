import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../domain/defaultDocument";
import type { RichTextDocument } from "../domain/document";
import {
  applyInlineFormat,
  applyParagraphFormat,
  PAGE_BREAK_CHARACTER,
  plainTextToStoryContent,
  storyToPlainText,
} from "../domain/textStory";
import { composeStory } from "./pagination";
import { synchronizePhysicalPages } from "./pageSynchronization";
import { DeterministicTextMeasurer } from "./textMeasurement";
import { resolvePageNumber } from "../domain/pageNumbering";

const measurer = new DeterministicTextMeasurer();

function layout(text: string, configure?: (document: ReturnType<typeof createDefaultDocument>) => void) {
  const document = createDefaultDocument(new Date("2026-08-12T00:00:00Z"));
  configure?.(document);
  const content = plainTextToStoryContent(text);
  return {
    content,
    snapshot: composeStory({
      storyId: "main-story",
      content,
      pageSetup: document.pageSetup,
      styles: document.styles,
      measurer,
    }),
  };
}

function reconstruct(content: RichTextDocument, pageTexts: string[]): string {
  return pageTexts.join("").replaceAll("\u200b", "") || storyToPlainText(content);
}

function fragments(snapshot: ReturnType<typeof layout>["snapshot"]): string[] {
  return snapshot.pages.map((page) => page.fragments.map((fragment) => fragment.text).join(""));
}

describe("automatic text pagination", () => {
  it("A: keeps small content on one page without loss", () => {
    const result = layout("Um parágrafo curto.");
    expect(result.snapshot.pages).toHaveLength(1);
    expect(reconstruct(result.content, fragments(result.snapshot))).toBe("Um parágrafo curto.");
  });

  it("B/C: flows overflow through multiple pages in source order", () => {
    const text = "palavra ".repeat(7000).trim();
    const result = layout(text);
    expect(result.snapshot.pages.length).toBeGreaterThan(3);
    expect(fragments(result.snapshot).join("")).toBe(text);
  });

  it("D/E: reflows forward and backward and removes unnecessary pages", () => {
    const base = "texto de teste ".repeat(2800);
    const initial = layout(base).snapshot.pages.length;
    const expanded = layout(`${"introdução longa ".repeat(1800)}${base}`).snapshot.pages.length;
    const reduced = layout(base).snapshot.pages.length;
    expect(expanded).toBeGreaterThan(initial);
    expect(reduced).toBe(initial);
  });

  it("F: smaller text area after a margin change increases page count", () => {
    const text = "margens e composição ".repeat(2500);
    const normal = layout(text).snapshot.pages.length;
    const narrow = layout(text, (document) => {
      document.pageSetup.margins.inner = 45;
      document.pageSetup.margins.outer = 40;
      document.pageSetup.margins.top = 40;
      document.pageSetup.margins.bottom = 40;
    }).snapshot.pages.length;
    expect(narrow).toBeGreaterThan(normal);
  });

  it("G: changing page dimensions causes a complete deterministic reflow", () => {
    const text = "tamanho da página ".repeat(2500);
    const a5 = layout(text).snapshot.pages.length;
    const a4 = layout(text, (document) => {
      document.pageSetup.width = 210;
      document.pageSetup.height = 297;
    }).snapshot.pages.length;
    expect(a4).toBeLessThan(a5);
  });

  it("H: a persisted manual break starts following content on a new page", () => {
    const content = `Primeira página${PAGE_BREAK_CHARACTER}Segunda página`;
    const result = layout(content);
    expect(result.snapshot.pages).toHaveLength(2);
    expect(fragments(result.snapshot)).toEqual(["Primeira página", "Segunda página"]);
    expect(storyToPlainText(result.content)).toBe(content);
  });

  it("J: dynamic physical pages retain identity and are recalculated by count", () => {
    const document = createDefaultDocument();
    const originalId = document.pages[0].id;
    const many = synchronizePhysicalPages(document.pages, 12);
    const few = synchronizePhysicalPages(many, 3);
    expect(many).toHaveLength(12);
    expect(few).toHaveLength(3);
    expect(few[0].id).toBe(originalId);
  });

  it("does not remove a future page that already owns positioned objects", () => {
    const document = createDefaultDocument();
    const pages = synchronizePhysicalPages(document.pages, 5);
    pages[4].objects.push({
      id: "future-image",
      type: "image",
      anchorMode: "page",
      assetId: "future-asset",
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      originalAspectRatio: 1,
      lockAspectRatio: true,
      zIndex: 1,
    });
    expect(synchronizePhysicalPages(pages, 1)).toHaveLength(5);
  });

  it("J/K: keeps an object on physical page 10 when text shrinks from eight pages", () => {
    const document = createDefaultDocument();
    const pages = synchronizePhysicalPages(document.pages, 10);
    pages[9].objects.push({
      id: "fixed-page-ten",
      type: "image",
      anchorMode: "page",
      assetId: "asset-ten",
      x: -3,
      y: 20,
      width: 50,
      height: 25,
      originalAspectRatio: 2,
      lockAspectRatio: true,
      zIndex: 0,
    });
    const afterReflow = synchronizePhysicalPages(pages, 8);
    expect(afterReflow).toHaveLength(10);
    expect(afterReflow[9].objects[0]).toMatchObject({ id: "fixed-page-ten", x: -3 });
    expect(afterReflow[7].objects).toEqual([]);
  });

  it("J: editorial numbering is derived again after automatic pagination", () => {
    const document = createDefaultDocument();
    document.numbering.ranges[0].fromPhysicalIndex = 0;
    document.numbering.ranges[0].logicalStart = 1;
    document.numbering.display.logicalRanges = [{ from: 1 }];
    const composed = layout("numeração dinâmica ".repeat(3500)).snapshot;
    const pages = synchronizePhysicalPages(document.pages, composed.pages.length);
    const lastIndex = pages.length - 1;
    expect(resolvePageNumber(pages[0], 0, document.numbering).logicalNumber).toBe(1);
    expect(resolvePageNumber(pages[lastIndex], lastIndex, document.numbering)).toMatchObject({
      physicalNumber: pages.length,
      logicalNumber: pages.length,
      visible: true,
    });
  });

  it("C: aumentar o tamanho inline dispara reflow e aumenta a paginação", () => {
    const document = createDefaultDocument();
    const content = plainTextToStoryContent("tipografia responsiva ".repeat(2400));
    const compose = (source: RichTextDocument) => composeStory({
      storyId: "main-story",
      content: source,
      pageSetup: document.pageSetup,
      styles: document.styles,
      measurer,
    }).pages.length;
    const formatted = applyInlineFormat(
      content,
      { anchor: 0, head: storyToPlainText(content).length },
      "fontSize",
      18,
    );
    expect(compose(formatted)).toBeGreaterThan(compose(content));
  });

  it("D: aumentar line-height por override repagina a história", () => {
    const document = createDefaultDocument();
    const content = plainTextToStoryContent("linha e ritmo ".repeat(2200));
    const expanded = applyParagraphFormat(
      content,
      { anchor: 0, head: storyToPlainText(content).length },
      "lineHeight",
      2,
    );
    const compose = (source: RichTextDocument) => composeStory({
      storyId: "main-story",
      content: source,
      pageSetup: document.pageSetup,
      styles: document.styles,
      measurer,
    }).pages.length;
    expect(compose(expanded)).toBeGreaterThan(compose(content));
  });

  it("L: reflow rico mantém a numeração editorial derivada da página física", () => {
    const document = createDefaultDocument();
    document.numbering.ranges[0] = {
      ...document.numbering.ranges[0],
      fromPhysicalIndex: 0,
      logicalStart: 1,
    };
    document.numbering.display.logicalRanges = [{ from: 1 }];
    const content = plainTextToStoryContent("numeração após rich text ".repeat(1800));
    const formatted = applyInlineFormat(
      content,
      { anchor: 0, head: storyToPlainText(content).length },
      "fontSize",
      18,
    );
    const snapshot = composeStory({
      storyId: "main-story",
      content: formatted,
      pageSetup: document.pageSetup,
      styles: document.styles,
      measurer,
    });
    const pages = synchronizePhysicalPages(document.pages, snapshot.pages.length);
    const last = pages.length - 1;
    expect(resolvePageNumber(pages[last], last, document.numbering).logicalNumber).toBe(pages.length);
  });
});
