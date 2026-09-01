import type {
  InlineTextNode,
  PageSetup,
  ParagraphNode,
  ParagraphStyle,
  RichTextDocument,
} from "../domain/document";
import { hyphenationBreakOffsets } from "../domain/hyphenation";
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
const HYPHEN_GLYPH = "-";

/** Mínimo de linhas de um parágrafo que devem permanecer juntas antes de uma quebra de página (órfãs). */
const ORPHAN_MIN_LINES = 2;
/** Mínimo de linhas de um parágrafo que devem começar juntas depois de uma quebra de página (viúvas). */
const WIDOW_MIN_LINES = 2;

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
  hyphenated: boolean;
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

function styleAtOffset(
  runs: SourceRun[],
  offset: number,
  fallbackStyle: ResolvedInlineStyle,
): ResolvedInlineStyle {
  const run = runs.find((candidate) => offset >= candidate.from && offset < candidate.to);
  return run?.style ?? fallbackStyle;
}

/**
 * Um hífen literal já existente conta como limite de palavra, assim como
 * espaço e tabulação: evita hifenizar novamente dentro de um segmento de uma
 * palavra composta (ex.: "bem-vindo") ou de qualquer trecho sem espaços que já
 * contenha um hífen próprio (ex.: um identificador "ALGO-OUTRO"). Mantém o
 * mesmo critério usado pelo tokenizador interno do pacote `hyphen`.
 */
function isWordBoundaryCharacter(character: string | undefined): boolean {
  return character === " " || character === "\t" || character === "-";
}

function wordBoundsAround(text: string, index: number, from: number): { start: number; end: number } {
  let start = index;
  while (start > from && !isWordBoundaryCharacter(text[start - 1])) start -= 1;
  let end = index;
  while (end < text.length && !isWordBoundaryCharacter(text[end])) end += 1;
  return { start, end };
}

/**
 * Ponto de quebra hifenizada dentro da palavra que ultrapassa `lineFrom..lineWidth`,
 * escolhendo o maior offset cuja linha resultante (incluindo o hífen visual)
 * ainda cabe na largura disponível. Retorna `null` quando a palavra não tem
 * pontos válidos ou nenhum deles cabe.
 */
function findHyphenationBreak(
  text: string,
  runs: SourceRun[],
  lineFrom: number,
  wordStart: number,
  wordEnd: number,
  lineWidthMm: number,
  fallbackStyle: ResolvedInlineStyle,
  measurer: TextMeasurer,
): number | null {
  const offsets = hyphenationBreakOffsets(text.slice(wordStart, wordEnd));
  for (let index = offsets.length - 1; index >= 0; index -= 1) {
    const breakPoint = wordStart + offsets[index];
    const hyphenStyle = styleAtOffset(runs, breakPoint - 1, fallbackStyle);
    const width = measureRange(text, runs, lineFrom, breakPoint, fallbackStyle, measurer)
      + measurer.measure(HYPHEN_GLYPH, hyphenStyle);
    if (width <= lineWidthMm + 0.0001) return breakPoint;
  }
  return null;
}

function wrapParagraph(
  block: ParagraphNode,
  widthMm: number,
  style: ParagraphStyle,
  measurer: TextMeasurer,
): { lines: WrappedLine[]; runs: SourceRun[] } {
  const text = paragraphText(block);
  const runs = sourceRuns(block, style);
  const fallbackStyle = resolveInlineStyle(style);
  if (!text) {
    return {
      lines: [{
        from: 0,
        to: 0,
        heightMm: style.fontSizePt * PT_TO_MM * style.lineHeight,
        availableWidthMm: Math.max(1, widthMm - style.firstLineIndentMm),
        naturalWidthMm: 0,
        hyphenated: false,
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
    let hyphenated = false;
    if (to < text.length) {
      const breaksMidWord = !isWordBoundaryCharacter(text[to - 1]) && !isWordBoundaryCharacter(text[to]);
      if (breaksMidWord) {
        const { start: wordStart, end: wordEnd } = wordBoundsAround(text, to, from);
        const hyphenBreak = findHyphenationBreak(
          text,
          runs,
          from,
          wordStart,
          wordEnd,
          lineWidth,
          fallbackStyle,
          measurer,
        );
        if (hyphenBreak !== null) {
          to = hyphenBreak;
          hyphenated = true;
        }
      }
      if (!hyphenated) {
        const candidate = text.slice(from, to);
        const boundary = Math.max(
          candidate.lastIndexOf(" "),
          candidate.lastIndexOf("\t"),
          candidate.lastIndexOf("-"),
        );
        if (boundary > 0) to = from + boundary + 1;
      }
    }
    const naturalWidthMm = measureRange(text, runs, from, to, fallbackStyle, measurer)
      + (hyphenated ? measurer.measure(HYPHEN_GLYPH, styleAtOffset(runs, to - 1, fallbackStyle)) : 0);
    lines.push({
      from,
      to,
      heightMm: lineHeight(runs, from, to, style),
      availableWidthMm: lineWidth,
      naturalWidthMm,
      hyphenated,
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

/**
 * Ajusta `endLine` para respeitar órfãs/viúvas quando a quebra encontrada por
 * altura deixaria poucas linhas de um lado ou outro da página. Quando as duas
 * regras não podem ser satisfeitas ao mesmo tempo, adia o trecho inteiro para
 * a próxima página. Numa página já vazia (`!pageHasContent`), aceita a quebra
 * natural sem adiar mais, evitando um loop sem progresso.
 */
function applyOrphanWidowControl(
  lineIndex: number,
  endLine: number,
  totalLines: number,
  pageHasContent: boolean,
): number {
  if (endLine >= totalLines) return endLine;
  const remaining = totalLines - endLine;
  let adjusted = endLine;
  if (remaining < WIDOW_MIN_LINES) adjusted -= WIDOW_MIN_LINES - remaining;
  if (adjusted - lineIndex < ORPHAN_MIN_LINES) adjusted = lineIndex;
  adjusted = Math.max(lineIndex, adjusted);
  if (adjusted === lineIndex && !pageHasContent) return endLine;
  return adjusted;
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
      const controlledEndLine = applyOrphanWidowControl(
        lineIndex,
        endLine,
        wrapped.lines.length,
        page.fragments.length > 0,
      );
      if (controlledEndLine !== endLine) {
        endLine = controlledEndLine;
        fragmentHeight = 0;
        for (let index = lineIndex; index < endLine; index += 1) fragmentHeight += wrapped.lines[index].heightMm;
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
          hyphenated: wrappedLine.hyphenated,
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
