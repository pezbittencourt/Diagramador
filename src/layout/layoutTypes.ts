import type { ResolvedInlineStyle } from "../domain/textFormatting";
import type { ParagraphStyle } from "../domain/document";

export interface TextPosition {
  storyId: string;
  offset: number;
}

export interface LaidOutInlineRun {
  text: string;
  from: number;
  to: number;
  globalFrom: number;
  globalTo: number;
  /** Avanço medido pelo mesmo compositor que decidiu a quebra de linha. */
  advanceMm: number;
  style: ResolvedInlineStyle;
}

/**
 * Linha física já composta. Preview e PDF consomem esta geometria e nunca
 * voltam a decidir onde o texto quebra.
 */
export interface LaidOutTextLine {
  from: number;
  to: number;
  globalFrom: number;
  globalTo: number;
  paragraphLineIndex: number;
  isLastLineOfParagraph: boolean;
  xMm: number;
  topMm: number;
  heightMm: number;
  availableWidthMm: number;
  naturalWidthMm: number;
  renderedWidthMm: number;
  wordSpacingMm: number;
  alignment: ParagraphStyle["alignment"];
  /** Linha quebrada dentro de uma palavra por hifenização; recebe um hífen visual ao final. */
  hyphenated: boolean;
  runs: LaidOutInlineRun[];
}

export interface LaidOutParagraphFragment {
  kind: "paragraph";
  blockId: string;
  styleId: string;
  paragraphStyle: ParagraphStyle;
  text: string;
  lines: LaidOutTextLine[];
  /** Mantido como atalho compatível para diagnósticos e benchmarks. */
  runs: LaidOutInlineRun[];
  from: number;
  to: number;
  globalFrom: number;
  globalTo: number;
  lineCount: number;
  startsParagraph: boolean;
  endsParagraph: boolean;
}

export interface LaidOutPage {
  physicalIndex: number;
  fragments: LaidOutParagraphFragment[];
  usedHeightMm: number;
}

export interface LayoutSnapshot {
  revision: number;
  storyId: string;
  pages: LaidOutPage[];
  sourceLength: number;
  composeTimeMs: number;
}
