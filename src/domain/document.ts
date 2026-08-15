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

export interface ParagraphStyleProperties {
  fontFamily: string;
  fontSizePt: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  color: string;
  lineHeight: number;
  alignment: ParagraphAlignment;
  spaceBeforePt: number;
  spaceAfterPt: number;
  firstLineIndentMm: number;
  leftIndentMm: number;
  rightIndentMm: number;
}

export interface ParagraphStyle extends ParagraphStyleProperties {
  id: string;
  name: string;
}

export type ParagraphOverrides = Partial<ParagraphStyleProperties>;

/**
 * Conteúdo semântico contínuo. As quebras de página nunca são gravadas nesta
 * árvore: elas pertencem ao LayoutSnapshot, que pode ser recalculado.
 */
export interface RichTextMark {
  type: string;
  attrs?: { value?: string | number | boolean };
}

export interface InlineTextNode {
  type: "text";
  text: string;
  marks?: RichTextMark[];
}

export interface ParagraphNode {
  type: "paragraph";
  id: string;
  attrs: { styleId: string; overrides?: ParagraphOverrides };
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

interface PositionedObjectBase {
  id: string;
  /** Objetos do schema 3 são fixos à página física que os contém. */
  anchorMode: "page";
  x: Millimeters;
  y: Millimeters;
  width: Millimeters;
  height: Millimeters;
  zIndex: number;
}

export interface PositionedImageObject extends PositionedObjectBase {
  type: "image";
  assetId: string;
  originalAspectRatio: number;
  lockAspectRatio: boolean;
}

/** Reserva explícita para um tipo futuro, ainda sem interface de criação. */
export interface PositionedTextFrameObject extends PositionedObjectBase {
  type: "text-frame";
  storyId: string;
}

export type PositionedObject = PositionedImageObject | PositionedTextFrameObject;

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
  showRulers: boolean;
  showCustomGuides: boolean;
  snapEnabled: boolean;
  viewMode: "spread" | "single";
}

export interface DocumentGuide {
  id: string;
  orientation: "horizontal" | "vertical";
  positionMm: Millimeters;
}

export interface AssetReference {
  id: string;
  fileName: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  encoding: "base64";
  data: string;
  pixelWidth: number;
  pixelHeight: number;
}

export interface BookDocument {
  schemaVersion: 3;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pageSetup: PageSetup;
  viewSettings: DocumentViewSettings;
  guides: DocumentGuide[];
  pages: BookPage[];
  stories: TextStory[];
  styles: ParagraphStyle[];
  numbering: PageNumbering;
  assets: AssetReference[];
}
