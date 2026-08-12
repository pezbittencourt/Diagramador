export interface TextPosition {
  storyId: string;
  offset: number;
}

export interface LaidOutParagraphFragment {
  kind: "paragraph";
  blockId: string;
  styleId: string;
  text: string;
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
