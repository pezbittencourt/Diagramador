export type Millimeters = number;

export interface EdgeValues {
  top: Millimeters;
  bottom: Millimeters;
  inner: Millimeters;
  outer: Millimeters;
}

export type PagePreset = "A4" | "A5" | "custom";

export interface PageSetup {
  preset: PagePreset;
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
export interface RichTextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface InlineTextNode {
  type: "text";
  text: string;
  marks?: RichTextMark[];
}

export interface ParagraphNode {
  type: "paragraph";
  id: string;
  attrs: { styleId: string };
  content: InlineTextNode[];
}

export interface PageBreakNode {
  type: "pageBreak";
  id: string;
}

export type StoryBlock = ParagraphNode | PageBreakNode;

export interface RichTextDocument {
  type: "doc";
  content: StoryBlock[];
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
  to?: number;
}

export interface PageNumbering {
  ranges: NumberingRange[];
  display: {
    defaultVisible: boolean;
    logicalRanges: LogicalDisplayRange[];
    /** Exceções editoriais por número lógico, como aberturas de capítulo. */
    hiddenLogicalNumbers: number[];
    /** Exceções por identidade física, mantidas para regras futuras por página. */
    hiddenPageIds: string[];
  };
  placement: {
    vertical: "top" | "bottom";
    horizontal: "inner" | "outer" | "center";
    mirrorOnFacingPages: boolean;
  };
}

export interface DocumentViewSettings {
  showMargins: boolean;
  showBleed: boolean;
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
  viewSettings: DocumentViewSettings;
  pages: BookPage[];
  stories: TextStory[];
  styles: ParagraphStyle[];
  numbering: PageNumbering;
  assets: AssetReference[];
}
