import type {
  InlineTextNode,
  PageSetup,
  ParagraphNode,
  ParagraphStyle,
  RichTextDocument,
} from "../domain/document";
import { resolveFacingEdges } from "../domain/pageGeometry";
import {
  resolveInlineStyle,
  resolveParagraphStyle,
  type ResolvedInlineStyle,
} from "../domain/textFormatting";
import { paragraphText, storyToPlainText } from "../domain/textStory";
import type {
  LaidOutInlineRun,
  LaidOutPage,
  LaidOutParagraphFragment,
  LaidOutTextLine,
  LayoutSnapshot,
} from "./layoutTypes";
import type { TextMeasurer } from "./textMeasurement";

const PT_TO_MM = 25.4 / 72;

export interface ComposeStoryInput {
  storyId: string;
  content: RichTextDocument;
  pageSetup: PageSetup;
  styles: ParagraphStyle[];
  measurer: TextMeasurer;
  revision?: number;
}

interface SourceRun {
  node: InlineTextNode;
  from: number;
  to: number;
  style: ResolvedInlineStyle;
}

interface WrappedLine {
  from: number;
  to: number;
  heightMm: number;
  availableWidthMm: number;
  naturalWidthMm: number;
}

function whitespaceCount(text: string): number {
  return [...text].filter((character) => character === " ").length;
}

function sourceRuns(block: ParagraphNode, style: ParagraphStyle): SourceRun[] {
  const runs: SourceRun[] = [];
  let offset = 0;
  for (const node of block.content) {
    const to = offset + node.text.length;
    runs.push({ node, from: offset, to, style: resolveInlineStyle(style, node.marks) });
    offset = to;
  }
  return runs;
}

function measureRange(
  text: string,
  runs: SourceRun[],
  from: number,
  to: number,
  fallbackStyle: ResolvedInlineStyle,
  measurer: TextMeasurer,
): number {
  if (from === to) return 0;
  let width = 0;
  for (const run of runs) {
    const overlapFrom = Math.max(from, run.from);
    const overlapTo = Math.min(to, run.to);
    if (overlapFrom < overlapTo) {
      width += measurer.measure(text.slice(overlapFrom, overlapTo), run.style);
    }
  }
  return width || measurer.measure(text.slice(from, to), fallbackStyle);
}

function lineHeight(
  runs: SourceRun[],
  from: number,
  to: number,
  paragraphStyle: ParagraphStyle,
): number {
  const sizes = runs
    .filter((run) => run.to > from && run.from < to)
    .map((run) => run.style.fontSizePt);
  return Math.max(paragraphStyle.fontSizePt, ...sizes) * PT_TO_MM * paragraphStyle.lineHeight;
}

function maximumFittingEnd(
  text: string,
  runs: SourceRun[],
  from: number,
  availableWidthMm: number,
  style: ParagraphStyle,
  measurer: TextMeasurer,
): number {
  const fallback = resolveInlineStyle(style);
  let result = from;
  let step = 1;
  while (from + step <= text.length) {
    const candidate = from + step;
    if (measureRange(text, runs, from, candidate, fallback, measurer) > availableWidthMm) break;
    result = candidate;
    if (candidate === text.length) return candidate;
    step *= 2;
  }
  let low = result + 1;
  let high = Math.min(text.length, from + step);
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (measureRange(text, runs, from, middle, fallback, measurer) <= availableWidthMm) {
      result = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return result === from ? Math.min(text.length, from + 1) : result;
}

function wrapParagraph(
  block: ParagraphNode,
  widthMm: number,
  style: ParagraphStyle,
  measurer: TextMeasurer,
): { lines: WrappedLine[]; runs: SourceRun[] } {
  const text = paragraphText(block);
  const runs = sourceRuns(block, style);
  if (!text) {
    return {
      lines: [{
        from: 0,
        to: 0,
        heightMm: style.fontSizePt * PT_TO_MM * style.lineHeight,
        availableWidthMm: Math.max(1, widthMm - style.firstLineIndentMm),
        naturalWidthMm: 0,
      }],
      runs,
    };
  }
  const lines: WrappedLine[] = [];
  let from = 0;
  while (from < text.length) {
    const firstLine = lines.length === 0;
    const lineWidth = Math.max(1, widthMm - (firstLine ? style.firstLineIndentMm : 0));
    let to = maximumFittingEnd(text, runs, from, lineWidth, style, measurer);
    if (to < text.length) {
      const candidate = text.slice(from, to);
      const whitespace = Math.max(candidate.lastIndexOf(" "), candidate.lastIndexOf("\t"));
      if (whitespace > 0) to = from + whitespace + 1;
    }
    lines.push({
      from,
      to,
      heightMm: lineHeight(runs, from, to, style),
      availableWidthMm: lineWidth,
      naturalWidthMm: measureRange(text, runs, from, to, resolveInlineStyle(style), measurer),
    });
    from = to;
  }
  return { lines, runs };
}

function fragmentRuns(
  runs: SourceRun[],
  from: number,
  to: number,
  blockGlobalStart: number,
  fallbackStyle: ResolvedInlineStyle,
  measurer: TextMeasurer,
): LaidOutInlineRun[] {
  const result: LaidOutInlineRun[] = [];
  for (const run of runs) {
    const overlapFrom = Math.max(from, run.from);
    const overlapTo = Math.min(to, run.to);
    if (overlapFrom < overlapTo) {
      const text = run.node.text.slice(overlapFrom - run.from, overlapTo - run.from);
      result.push({
        text,
        from: overlapFrom,
        to: overlapTo,
        globalFrom: blockGlobalStart + overlapFrom,
        globalTo: blockGlobalStart + overlapTo,
        advanceMm: measurer.measure(text, run.style),
        style: run.style,
      });
    }
  }
  if (!result.length) {
    result.push({
      text: "",
      from,
      to,
      globalFrom: blockGlobalStart + from,
      globalTo: blockGlobalStart + to,
      advanceMm: 0,
      style: fallbackStyle,
    });
  }
  return result;
}

function createPage(physicalIndex: number): LaidOutPage {
  return { physicalIndex, fragments: [], usedHeightMm: 0 };
}

export function composeStory({
  storyId,
  content,
  pageSetup,
  styles,
  measurer,
  revision = 0,
}: ComposeStoryInput): LayoutSnapshot {
  const startedAt = performance.now();
  const pages: LaidOutPage[] = [createPage(0)];
  let page = pages[0];
  let globalOffset = 0;
  const nextPage = () => {
    page = createPage(pages.length);
    pages.push(page);
  };

  for (let blockIndex = 0; blockIndex < content.content.length; blockIndex += 1) {
    const block = content.content[blockIndex];
    if (block.type === "pageBreak") {
      globalOffset += 1;
      nextPage();
      continue;
    }
    const style = resolveParagraphStyle(styles, block);
    const text = paragraphText(block);
    const spaceBeforeMm = style.spaceBeforePt * PT_TO_MM;
    const spaceAfterMm = style.spaceAfterPt * PT_TO_MM;
    const blockGlobalStart = globalOffset;
    const wrapped = wrapParagraph(
      block,
      Math.max(
        1,
        pageSetup.width - pageSetup.margins.inner - pageSetup.margins.outer
          - style.leftIndentMm - style.rightIndentMm,
      ),
      style,
      measurer,
    );
    let lineIndex = 0;
    let firstFragment = true;

    while (lineIndex < wrapped.lines.length) {
      const margins = resolveFacingEdges(
        pageSetup.margins,
        page.physicalIndex,
        pageSetup.mirroredMargins,
      );
      const pageHeightMm = pageSetup.height - margins.top - margins.bottom;
      const before = firstFragment ? spaceBeforeMm : 0;
      const availableHeight = pageHeightMm - page.usedHeightMm - before;
      let endLine = lineIndex;
      let fragmentHeight = 0;
      while (endLine < wrapped.lines.length) {
        const candidate = wrapped.lines[endLine].heightMm;
        if (endLine > lineIndex && fragmentHeight + candidate > availableHeight + 0.0001) break;
        if (endLine === lineIndex && candidate > availableHeight + 0.0001 && page.fragments.length) break;
        fragmentHeight += candidate;
        endLine += 1;
      }
      if (endLine === lineIndex) {
        nextPage();
        continue;
      }
      const from = wrapped.lines[lineIndex].from;
      const to = wrapped.lines[endLine - 1].to;
      const endsParagraph = endLine === wrapped.lines.length;
      const fallbackStyle = resolveInlineStyle(style);
      let lineTopMm = margins.top + page.usedHeightMm + before;
      const lines: LaidOutTextLine[] = wrapped.lines.slice(lineIndex, endLine).map((wrappedLine, index) => {
        const paragraphLineIndex = lineIndex + index;
        const firstParagraphLine = paragraphLineIndex === 0;
        const isLastLineOfParagraph = paragraphLineIndex === wrapped.lines.length - 1;
        const lineText = text.slice(wrappedLine.from, wrappedLine.to);
        const expandableWhitespace = whitespaceCount(lineText);
        const shouldJustify = style.alignment === "justify"
          && !isLastLineOfParagraph
          && expandableWhitespace > 0;
        const wordSpacingMm = shouldJustify
          ? Math.max(0, wrappedLine.availableWidthMm - wrappedLine.naturalWidthMm) / expandableWhitespace
          : 0;
        const renderedWidthMm = shouldJustify
          ? wrappedLine.availableWidthMm
          : wrappedLine.naturalWidthMm;
        const alignmentOffsetMm = style.alignment === "center"
          ? Math.max(0, wrappedLine.availableWidthMm - wrappedLine.naturalWidthMm) / 2
          : style.alignment === "right"
            ? Math.max(0, wrappedLine.availableWidthMm - wrappedLine.naturalWidthMm)
            : 0;
        const result: LaidOutTextLine = {
          from: wrappedLine.from,
          to: wrappedLine.to,
          globalFrom: blockGlobalStart + wrappedLine.from,
          globalTo: blockGlobalStart + wrappedLine.to,
          paragraphLineIndex,
          isLastLineOfParagraph,
          xMm: margins.left + style.leftIndentMm
            + (firstParagraphLine ? style.firstLineIndentMm : 0)
            + alignmentOffsetMm,
          topMm: lineTopMm,
          heightMm: wrappedLine.heightMm,
          availableWidthMm: wrappedLine.availableWidthMm,
          naturalWidthMm: wrappedLine.naturalWidthMm,
          renderedWidthMm,
          wordSpacingMm,
          alignment: style.alignment,
          runs: fragmentRuns(
            wrapped.runs,
            wrappedLine.from,
            wrappedLine.to,
            blockGlobalStart,
            fallbackStyle,
            measurer,
          ),
        };
        lineTopMm += wrappedLine.heightMm;
        return result;
      });
      const fragment: LaidOutParagraphFragment = {
        kind: "paragraph",
        blockId: block.id,
        styleId: style.id,
        paragraphStyle: style,
        text: text.slice(from, to),
        lines,
        runs: fragmentRuns(wrapped.runs, from, to, blockGlobalStart, fallbackStyle, measurer),
        from,
        to,
        globalFrom: blockGlobalStart + from,
        globalTo: blockGlobalStart + to,
        lineCount: endLine - lineIndex,
        startsParagraph: firstFragment,
        endsParagraph,
      };
      page.fragments.push(fragment);
      page.usedHeightMm += before + fragmentHeight;
      if (endsParagraph) page.usedHeightMm += spaceAfterMm;
      lineIndex = endLine;
      firstFragment = false;
      if (!endsParagraph) nextPage();
    }
    globalOffset += text.length;
    if (content.content[blockIndex + 1]?.type === "paragraph") globalOffset += 1;
  }

  return {
    revision,
    storyId,
    pages,
    sourceLength: storyToPlainText(content).length,
    composeTimeMs: performance.now() - startedAt,
  };
}
