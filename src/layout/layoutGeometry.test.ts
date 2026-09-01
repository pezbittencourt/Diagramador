import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../domain/defaultDocument";
import type {
  InlineTextNode,
  ParagraphAlignment,
  PageSetup,
  ParagraphStyle,
  RichTextDocument,
  StoryBlock,
} from "../domain/document";
import { hyphenationBreakOffsets } from "../domain/hyphenation";
import { resolveFacingEdges } from "../domain/pageGeometry";
import { composeStory } from "./pagination";
import type { LaidOutTextLine } from "./layoutTypes";
import type { TextMeasurer } from "./textMeasurement";

/** Um milímetro por code unit torna cada quebra previsível nestes testes. */
const unitMeasurer: TextMeasurer = {
  measure: (text) => text.length,
};

interface ComposeFixtureOptions {
  content: InlineTextNode[];
  setup?: Partial<PageSetup>;
  style?: Partial<ParagraphStyle>;
}

function composeFixture({ content, setup, style }: ComposeFixtureOptions) {
  const document = createDefaultDocument(new Date("2026-08-15T00:00:00Z"));
  const body = { ...document.styles[0], ...style };
  const pageSetup: PageSetup = {
    ...document.pageSetup,
    ...setup,
    margins: setup?.margins ?? { top: 2, bottom: 2, inner: 2, outer: 2 },
    bleed: setup?.bleed ?? document.pageSetup.bleed,
  };
  const story: RichTextDocument = {
    type: "doc",
    content: [{
      type: "paragraph",
      id: "geometry-paragraph",
      attrs: { styleId: body.id },
      content,
    }],
  };
  return composeStory({
    storyId: "geometry-story",
    content: story,
    pageSetup,
    styles: document.styles.map((candidate) => candidate.id === body.id ? body : candidate),
    measurer: unitMeasurer,
  });
}

function snapshotLines(snapshot: ReturnType<typeof composeFixture>): LaidOutTextLine[] {
  return snapshot.pages.flatMap((page) => page.fragments.flatMap((fragment) => fragment.lines));
}

describe("LayoutSnapshot line geometry", () => {
  it("reconstructs every fragment and the full paragraph exactly from line runs", () => {
    const source = "alfa beta gama delta ".repeat(18).trimEnd();
    const snapshot = composeFixture({
      content: [{ type: "text", text: source }],
      setup: { width: 24, height: 18 },
      style: { fontSizePt: 9, lineHeight: 1, firstLineIndentMm: 0, spaceAfterPt: 0 },
    });

    expect(snapshot.pages.length).toBeGreaterThan(1);
    for (const page of snapshot.pages) {
      for (const fragment of page.fragments) {
        expect(fragment.lines.map((line) => line.runs.map((run) => run.text).join("")).join(""))
          .toBe(fragment.text);
        expect(fragment.lines[0]?.from).toBe(fragment.from);
        expect(fragment.lines.at(-1)?.to).toBe(fragment.to);
      }
    }
    expect(snapshotLines(snapshot).map((line) => line.runs.map((run) => run.text).join("")).join(""))
      .toBe(source);
  });

  it("slices rich-text runs without loss when a physical line breaks inside a run", () => {
    // Dígitos não são hifenizáveis pelos padrões de português: garante uma
    // quebra bruta dentro do run (sem hífen), o cenário que este teste cobre.
    const snapshot = composeFixture({
      content: [
        { type: "text", text: "ab" },
        { type: "text", text: "0123456789", marks: [{ type: "bold", attrs: { value: true } }] },
      ],
      setup: { width: 9, height: 30 },
      style: { fontSizePt: 9, lineHeight: 1, firstLineIndentMm: 0, spaceAfterPt: 0 },
    });
    const lines = snapshotLines(snapshot);

    expect(lines.map((line) => line.runs.map((run) => run.text).join(""))).toEqual([
      "ab012",
      "34567",
      "89",
    ]);
    expect(lines[0].runs.map((run) => ({ text: run.text, from: run.from, to: run.to, bold: run.style.fontWeight })))
      .toEqual([
        { text: "ab", from: 0, to: 2, bold: 400 },
        { text: "012", from: 2, to: 5, bold: 700 },
      ]);
    expect(lines[1].runs).toHaveLength(1);
    expect(lines[1].runs[0]).toMatchObject({ text: "34567", from: 5, to: 10, globalFrom: 5, globalTo: 10 });
    expect(lines.flatMap((line) => line.runs).every((run) => run.advanceMm === run.text.length)).toBe(true);
    expect(lines.every((line) => !line.hyphenated)).toBe(true);
  });

  it("emits strictly monotonic topMm values within each physical page", () => {
    const snapshot = composeFixture({
      content: [{ type: "text", text: "um dois tres quatro cinco seis sete oito nove dez ".repeat(8) }],
      setup: { width: 22, height: 20 },
      style: { fontSizePt: 9, lineHeight: 1.1, firstLineIndentMm: 0, spaceAfterPt: 0 },
    });

    expect(snapshot.pages.length).toBeGreaterThan(1);
    for (const page of snapshot.pages) {
      const lines = page.fragments.flatMap((fragment) => fragment.lines);
      const margins = resolveFacingEdges(
        { top: 2, bottom: 2, inner: 2, outer: 2 },
        page.physicalIndex,
        true,
      );
      expect(lines[0]?.topMm).toBeCloseTo(margins.top, 8);
      for (let index = 1; index < lines.length; index += 1) {
        expect(lines[index].topMm).toBeCloseTo(
          lines[index - 1].topMm + lines[index - 1].heightMm,
          8,
        );
      }
    }
  });

  it("applies first-line indentation only to the first semantic line, not to page continuations", () => {
    const firstLineIndentMm = 6;
    const snapshot = composeFixture({
      content: [{ type: "text", text: "texto longo para atravessar paginas sem repetir o recuo ".repeat(10) }],
      setup: { width: 26, height: 16 },
      style: { fontSizePt: 9, lineHeight: 1, firstLineIndentMm, spaceAfterPt: 0 },
    });
    const lines = snapshotLines(snapshot);

    expect(snapshot.pages.length).toBeGreaterThan(1);
    expect(lines[0]).toMatchObject({ paragraphLineIndex: 0, xMm: 2 + firstLineIndentMm });
    expect(lines.slice(1).every((line) => line.xMm === 2)).toBe(true);
    for (const page of snapshot.pages.slice(1)) {
      const continuation = page.fragments[0]?.lines[0];
      expect(continuation?.paragraphLineIndex).toBeGreaterThan(0);
      expect(continuation?.xMm).toBe(2);
    }
  });

  it("justifies a page-fragment ending but leaves the semantic final line unexpanded", () => {
    const snapshot = composeFixture({
      content: [{ type: "text", text: "aa aa aa aa aa aa aa aa aa aa aa aa aa aa aa aa" }],
      setup: { width: 18, height: 11.2 },
      style: {
        alignment: "justify",
        fontSizePt: 10,
        lineHeight: 1,
        firstLineIndentMm: 0,
        spaceAfterPt: 0,
      },
    });
    const firstFragment = snapshot.pages[0].fragments[0];
    const fragmentEndingLine = firstFragment.lines.at(-1);
    const finalLine = snapshotLines(snapshot).at(-1);

    expect(snapshot.pages.length).toBeGreaterThan(1);
    expect(firstFragment.endsParagraph).toBe(false);
    expect(fragmentEndingLine).toMatchObject({
      isLastLineOfParagraph: false,
      alignment: "justify",
    });
    expect(fragmentEndingLine!.wordSpacingMm).toBeGreaterThan(0);
    expect(fragmentEndingLine!.renderedWidthMm).toBeCloseTo(fragmentEndingLine!.availableWidthMm, 8);

    expect(finalLine).toMatchObject({
      isLastLineOfParagraph: true,
      alignment: "justify",
      wordSpacingMm: 0,
    });
    expect(finalLine!.renderedWidthMm).toBeCloseTo(finalLine!.naturalWidthMm, 8);
    expect(finalLine!.renderedWidthMm).toBeLessThan(finalLine!.availableWidthMm);
  });

  it.each(["left", "center", "right", "justify"] as const)(
    "projects fractional %s alignment inside mirrored text frames on left and right pages",
    (alignment: ParagraphAlignment) => {
      const document = createDefaultDocument(new Date("2026-08-15T00:00:00Z"));
      const setup: PageSetup = {
        ...document.pageSetup,
        width: 31.75,
        height: 24.5,
        mirroredMargins: true,
        margins: { top: 2.5, bottom: 3.25, inner: 4.125, outer: 2.375 },
      };
      const style: ParagraphStyle = {
        ...document.styles[0],
        alignment,
        fontSizePt: 9,
        lineHeight: 1,
        leftIndentMm: 1.625,
        rightIndentMm: 0.875,
        firstLineIndentMm: 1.25,
        spaceBeforePt: 0,
        spaceAfterPt: 0,
      };
      const naturalWidthMm = 5;
      const availableWidthMm = 21.5;

      for (const physicalIndex of [0, 1]) {
        const blocks: StoryBlock[] = [];
        if (physicalIndex === 1) {
          blocks.push({ type: "pageBreak", id: `break-${alignment}` });
        }
        blocks.push({
          type: "paragraph",
          id: `aligned-${alignment}-${physicalIndex}`,
          attrs: { styleId: style.id },
          content: [{ type: "text", text: "abcde" }],
        });
        const snapshot = composeStory({
          storyId: `alignment-${alignment}-${physicalIndex}`,
          content: { type: "doc", content: blocks },
          pageSetup: setup,
          styles: document.styles.map((candidate) => candidate.id === style.id ? style : candidate),
          measurer: unitMeasurer,
        });
        const line = snapshot.pages[physicalIndex].fragments[0].lines[0];
        const margins = resolveFacingEdges(setup.margins, physicalIndex, true);
        const frameStartMm = margins.left + style.leftIndentMm + style.firstLineIndentMm;
        const alignmentOffsetMm = alignment === "center"
          ? (availableWidthMm - naturalWidthMm) / 2
          : alignment === "right"
            ? availableWidthMm - naturalWidthMm
            : 0;

        expect(line.availableWidthMm).toBeCloseTo(availableWidthMm, 10);
        expect(line.naturalWidthMm).toBeCloseTo(naturalWidthMm, 10);
        expect(line.xMm).toBeCloseTo(frameStartMm + alignmentOffsetMm, 10);
        expect(line.topMm).toBeCloseTo(setup.margins.top, 10);
        expect(line.alignment).toBe(alignment);
        expect(line.wordSpacingMm).toBe(0);
        expect(line.renderedWidthMm).toBeCloseTo(naturalWidthMm, 10);

        if (alignment === "center") {
          expect(line.xMm + line.renderedWidthMm / 2)
            .toBeCloseTo(frameStartMm + availableWidthMm / 2, 10);
        } else if (alignment === "right") {
          expect(line.xMm + line.renderedWidthMm)
            .toBeCloseTo(frameStartMm + availableWidthMm, 10);
        } else {
          expect(line.xMm).toBeCloseTo(frameStartMm, 10);
        }
      }
    },
  );

  it("preserves trailing whitespace and contiguous offsets at an exact line boundary", () => {
    const source = "ab  cd ";
    const snapshot = composeFixture({
      content: [
        { type: "text", text: "ab " },
        { type: "text", text: " cd ", marks: [{ type: "bold", attrs: { value: true } }] },
      ],
      setup: { width: 9, height: 30 },
      style: { fontSizePt: 9, lineHeight: 1, firstLineIndentMm: 0, spaceAfterPt: 0 },
    });
    const lines = snapshotLines(snapshot);

    expect(lines.map((line) => line.runs.map((run) => run.text).join(""))).toEqual([
      "ab  ",
      "cd ",
    ]);
    expect(lines[0].runs.map((run) => ({ text: run.text, from: run.from, to: run.to })))
      .toEqual([
        { text: "ab ", from: 0, to: 3 },
        { text: " ", from: 3, to: 4 },
      ]);
    expect(lines[1].runs).toHaveLength(1);
    expect(lines[1].runs[0]).toMatchObject({
      text: "cd ",
      from: 4,
      to: 7,
      globalFrom: 4,
      globalTo: 7,
      advanceMm: 3,
    });
    expect(lines[0]).toMatchObject({ from: 0, to: 4, globalFrom: 0, globalTo: 4 });
    expect(lines[1]).toMatchObject({ from: 4, to: 7, globalFrom: 4, globalTo: 7 });
    expect(lines[0].naturalWidthMm).toBe(4);
    expect(lines[0].availableWidthMm).toBe(5);
    expect(lines.map((line) => line.runs.map((run) => run.text).join("")).join(""))
      .toBe(source);

    let offset = 0;
    for (const line of lines) {
      expect(line.from).toBe(offset);
      let runOffset = line.from;
      for (const run of line.runs) {
        expect(run.from).toBe(runOffset);
        runOffset = run.to;
      }
      expect(runOffset).toBe(line.to);
      offset = line.to;
    }
    expect(offset).toBe(source.length);
  });
});

describe("hyphenation", () => {
  it("breaks a long Portuguese word with a hyphen instead of pushing it whole to the next line", () => {
    const snapshot = composeFixture({
      content: [{ type: "text", text: "desenvolvimento" }],
      setup: { width: 12, height: 30 },
      style: { fontSizePt: 9, lineHeight: 1, firstLineIndentMm: 0, spaceAfterPt: 0 },
    });
    const lines = snapshotLines(snapshot);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].hyphenated).toBe(true);
    expect(lines.at(-1)!.hyphenated).toBe(false);
    // A quebra ocorre exatamente num ponto silábico válido do módulo de hifenização.
    const validOffsets = hyphenationBreakOffsets("desenvolvimento");
    for (const line of lines.slice(0, -1)) {
      if (line.hyphenated) expect(validOffsets).toContain(line.to);
    }
    expect(lines.map((line) => line.runs.map((run) => run.text).join("")).join(""))
      .toBe("desenvolvimento");
  });

  it("does not hyphenate a word that has no valid Portuguese break points", () => {
    const snapshot = composeFixture({
      content: [{ type: "text", text: "0123456789012" }],
      setup: { width: 6, height: 30 },
      style: { fontSizePt: 9, lineHeight: 1, firstLineIndentMm: 0, spaceAfterPt: 0 },
    });
    const lines = snapshotLines(snapshot);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => !line.hyphenated)).toBe(true);
  });

  it("accounts for the hyphen glyph width when justifying a hyphenated line", () => {
    const snapshot = composeFixture({
      content: [{ type: "text", text: "uma palavra desenvolvimento continua" }],
      setup: { width: 12, height: 30 },
      style: { fontSizePt: 9, lineHeight: 1, firstLineIndentMm: 0, spaceAfterPt: 0, alignment: "justify" },
    });
    const hyphenatedLine = snapshotLines(snapshot).find((line) => line.hyphenated);

    expect(hyphenatedLine).toBeDefined();
    expect(hyphenatedLine!.renderedWidthMm).toBeLessThanOrEqual(hyphenatedLine!.availableWidthMm + 1e-6);
  });
});

describe("orphan and widow control", () => {
  const paragraphStyleOverrides = {
    fontSizePt: 10,
    lineHeight: 1,
    firstLineIndentMm: 0,
    spaceBeforePt: 0,
    spaceAfterPt: 0,
  } as const;

  function composeWithFiller(fillerText: string, targetText: string, pageHeightMm: number) {
    const document = createDefaultDocument(new Date("2026-08-15T00:00:00Z"));
    const body = { ...document.styles[0], ...paragraphStyleOverrides };
    const pageSetup: PageSetup = {
      ...document.pageSetup,
      width: 5,
      height: pageHeightMm,
      margins: { top: 2, bottom: 2, inner: 0, outer: 0 },
      bleed: { top: 0, bottom: 0, inner: 0, outer: 0 },
    };
    const styles = document.styles.map((candidate) => candidate.id === body.id ? body : candidate);
    const story: RichTextDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          id: "filler",
          attrs: { styleId: body.id },
          content: [{ type: "text", text: fillerText }],
        },
        {
          type: "paragraph",
          id: "target",
          attrs: { styleId: body.id },
          content: [{ type: "text", text: targetText }],
        },
      ],
    };
    return composeStory({
      storyId: "orphan-widow-story",
      content: story,
      pageSetup,
      styles,
      measurer: unitMeasurer,
    });
  }

  function targetLineHeightMm(targetText: string): number {
    const tall = composeWithFiller("abcd", targetText, 500);
    const line = tall.pages
      .flatMap((page) => page.fragments)
      .find((fragment) => fragment.blockId === "target")!.lines[0];
    return line.heightMm;
  }

  it("defers an entire short paragraph instead of leaving a single orphan line at the bottom of a page", () => {
    const targetText = "wxyz wxyz"; // duas linhas de uma "palavra" em uma coluna de 5mm
    const lineHeightMm = targetLineHeightMm(targetText);
    // Com o preenchimento (1 linha), sobra espaço para só mais 1 linha do alvo.
    const pageHeightMm = lineHeightMm * 2 + 4;
    const snapshot = composeWithFiller("abcd", targetText, pageHeightMm);

    expect(snapshot.pages[0].fragments.map((fragment) => fragment.blockId)).toEqual(["filler"]);

    const targetFragments = snapshot.pages
      .flatMap((page) => page.fragments)
      .filter((fragment) => fragment.blockId === "target");
    expect(targetFragments).toHaveLength(1);
    expect(targetFragments[0].lineCount).toBe(2);
    expect(targetFragments[0].text).toBe(targetText);
  });

  it("pulls a line back so at least two lines of a paragraph start together after a page break", () => {
    const targetText = "wxyz wxyz wxyz wxyz wxyz"; // cinco linhas em uma coluna de 5mm
    const lineHeightMm = targetLineHeightMm(targetText);
    // A página cheia cabe 5 linhas; com 1 linha de preenchimento sobram 4 "naturais" para o alvo.
    const pageHeightMm = lineHeightMm * 5 + 4;
    const snapshot = composeWithFiller("abcd", targetText, pageHeightMm);

    const targetFragments = snapshot.pages
      .flatMap((page) => page.fragments)
      .filter((fragment) => fragment.blockId === "target");

    expect(targetFragments).toHaveLength(2);
    expect(targetFragments[0].lineCount).toBe(3);
    expect(targetFragments[1].lineCount).toBe(2);
    expect(targetFragments.map((fragment) => fragment.text).join("")).toBe(targetText);
  });
});
