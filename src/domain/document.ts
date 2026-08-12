export type Millimeters = number;

export interface EdgeValues {
  top: Millimeters;
  bottom: Millimeters;
  inner: Millimeters;
  outer: Millimeters;
}

export interface PageSetup {
  width: Millimeters;
  height: Millimeters;
  margins: EdgeValues;
  bleed: EdgeValues;
  mirroredMargins: boolean;
}

export type ParagraphAlignment = "left" | "center" | "right" | "justify";

export interface ParagraphStyle {
  id: string;
  name: string;
  fontFamily: string;
  fontSizePt: number;
  lineHeight: number;
  alignment: ParagraphAlignment;
  spaceBeforePt: number;
  spaceAfterPt: number;
  firstLineIndentMm: number;
  leftIndentMm: number;
  rightIndentMm: number;
}

/**
 * Conteúdo semântico contínuo. As quebras de página nunca são gravadas nesta
 * árvore: elas pertencem ao LayoutSnapshot, que pode ser recalculado.
 */
export interface RichTextDocument {
  type: "doc";
  content: RichTextNode[];
}

export interface RichTextNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

export interface TextStory {
  id: string;
  name: string;
  content: RichTextDocument;
}

export interface PositionedObject {
  id: string;
  type: "image" | "text-frame";
  x: Millimeters;
  y: Millimeters;
  width: Millimeters;
  height: Millimeters;
  zIndex: number;
  assetId?: string;
  storyId?: string;
}

export interface BookPage {
  id: string;
  /** Exceção local. undefined deixa a política global decidir. */
  pageNumberVisible?: boolean;
  objects: PositionedObject[];
}

export type PageNumberFormat = "arabic" | "roman-lower" | "roman-upper";

export interface NumberingRange {
  id: string;
  fromPhysicalIndex: number;
  toPhysicalIndex?: number;
  logicalStart: number;
  format: PageNumberFormat;
  prefix?: string;
  suffix?: string;
}

export interface LogicalDisplayRange {
  from: number;
  to: number;
}

export interface PageNumbering {
  ranges: NumberingRange[];
  display: {
    defaultVisible: boolean;
    logicalRanges: LogicalDisplayRange[];
    hiddenPageIds: string[];
  };
  placement: {
    vertical: "top" | "bottom";
    horizontal: "inner" | "outer" | "center";
    mirrorOnFacingPages: boolean;
  };
}

export interface AssetReference {
  id: string;
  fileName: string;
  mimeType: string;
  path: string;
}

export interface BookDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pageSetup: PageSetup;
  pages: BookPage[];
  stories: TextStory[];
  styles: ParagraphStyle[];
  numbering: PageNumbering;
  assets: AssetReference[];
}

