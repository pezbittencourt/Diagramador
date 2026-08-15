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
      lines: [{ from: 0, to: 0, heightMm: style.fontSizePt * PT_TO_MM * style.lineHeight }],
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
    lines.push({ from, to, heightMm: lineHeight(runs, from, to, style) });
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
): LaidOutInlineRun[] {
  const result: LaidOutInlineRun[] = [];
  for (const run of runs) {
    const overlapFrom = Math.max(from, run.from);
    const overlapTo = Math.min(to, run.to);
    if (overlapFrom < overlapTo) {
      result.push({
        text: run.node.text.slice(overlapFrom - run.from, overlapTo - run.from),
        from: overlapFrom,
        to: overlapTo,
        globalFrom: blockGlobalStart + overlapFrom,
        globalTo: blockGlobalStart + overlapTo,
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
      const fragment: LaidOutParagraphFragment = {
        kind: "paragraph",
        blockId: block.id,
        styleId: style.id,
        paragraphStyle: style,
        text: text.slice(from, to),
        runs: fragmentRuns(wrapped.runs, from, to, blockGlobalStart, fallbackStyle),
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
