import type {
  PageSetup,
  ParagraphNode,
  ParagraphStyle,
  RichTextDocument,
} from "../domain/document";
import { resolveFacingEdges } from "../domain/pageGeometry";
import { paragraphText, storyToPlainText } from "../domain/textStory";
import type {
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

interface WrappedLine {
  from: number;
  to: number;
}

function defaultStyle(styles: ParagraphStyle[]): ParagraphStyle {
  const style = styles[0];
  if (!style) throw new Error("O documento precisa possuir ao menos um estilo de parágrafo.");
  return style;
}

function styleFor(block: ParagraphNode, styles: ParagraphStyle[]): ParagraphStyle {
  return styles.find((style) => style.id === block.attrs.styleId) ?? defaultStyle(styles);
}

function maximumFittingEnd(
  text: string,
  from: number,
  availableWidthMm: number,
  style: ParagraphStyle,
  measurer: TextMeasurer,
): number {
  let low = from + 1;
  let high = text.length;
  let result = from;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (measurer.measure(text.slice(from, middle), style) <= availableWidthMm) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result === from ? Math.min(text.length, from + 1) : result;
}

function wrapParagraph(
  text: string,
  widthMm: number,
  style: ParagraphStyle,
  measurer: TextMeasurer,
): WrappedLine[] {
  if (!text) return [{ from: 0, to: 0 }];
  const lines: WrappedLine[] = [];
  let from = 0;

  while (from < text.length) {
    const firstLine = lines.length === 0;
    const lineWidth = Math.max(1, widthMm - (firstLine ? style.firstLineIndentMm : 0));
    let to = maximumFittingEnd(text, from, lineWidth, style, measurer);
    if (to < text.length) {
      const candidate = text.slice(from, to);
      const whitespace = Math.max(candidate.lastIndexOf(" "), candidate.lastIndexOf("\t"));
      if (whitespace > 0) to = from + whitespace + 1;
    }
    lines.push({ from, to });
    from = to;
  }

  return lines;
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

    const style = styleFor(block, styles);
    const text = paragraphText(block);
    const lineHeightMm = style.fontSizePt * PT_TO_MM * style.lineHeight;
    const spaceBeforeMm = style.spaceBeforePt * PT_TO_MM;
    const spaceAfterMm = style.spaceAfterPt * PT_TO_MM;
    const blockGlobalStart = globalOffset;
    let lines = wrapParagraph(
      text,
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

    while (lineIndex < lines.length) {
      const margins = resolveFacingEdges(
        pageSetup.margins,
        page.physicalIndex,
        pageSetup.mirroredMargins,
      );
      const pageHeightMm = pageSetup.height - margins.top - margins.bottom;
      const before = firstFragment ? spaceBeforeMm : 0;
      const availableHeight = pageHeightMm - page.usedHeightMm - before;
      let fittingLines = Math.floor((availableHeight + 0.0001) / lineHeightMm);

      if (fittingLines <= 0) {
        if (page.fragments.length === 0) fittingLines = 1;
        else {
          nextPage();
          continue;
        }
      }

      const endLine = Math.min(lines.length, lineIndex + fittingLines);
      const from = lines[lineIndex].from;
      const to = lines[endLine - 1].to;
      const endsParagraph = endLine === lines.length;
      const fragment: LaidOutParagraphFragment = {
        kind: "paragraph",
        blockId: block.id,
        styleId: style.id,
        text: text.slice(from, to),
        from,
        to,
        globalFrom: blockGlobalStart + from,
        globalTo: blockGlobalStart + to,
        lineCount: endLine - lineIndex,
        startsParagraph: firstFragment,
        endsParagraph,
      };
      page.fragments.push(fragment);
      page.usedHeightMm += before + fragment.lineCount * lineHeightMm;
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
