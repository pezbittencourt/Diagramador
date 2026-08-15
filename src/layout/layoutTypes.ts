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
  style: ResolvedInlineStyle;
}

export interface LaidOutParagraphFragment {
  kind: "paragraph";
  blockId: string;
  styleId: string;
  paragraphStyle: ParagraphStyle;
  text: string;
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
