import type {
  InlineTextNode,
  ParagraphNode,
  ParagraphStyle,
  ParagraphStyleProperties,
  RichTextMark,
} from "./document";

export type InlineMarkType =
  | "bold"
  | "italic"
  | "underline"
  | "fontFamily"
  | "fontSize"
  | "textColor";

export interface ResolvedInlineStyle {
  fontFamily: string;
  fontSizePt: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  color: string;
}

export function defaultParagraphStyle(styles: ParagraphStyle[]): ParagraphStyle {
  const style = styles.find((candidate) => candidate.id === "body") ?? styles[0];
  if (!style) throw new Error("O documento precisa possuir ao menos um estilo de parágrafo.");
  return style;
}

export function resolveParagraphStyle(
  styles: ParagraphStyle[],
  paragraph: ParagraphNode,
): ParagraphStyle {
  const inherited = styles.find((style) => style.id === paragraph.attrs.styleId)
    ?? defaultParagraphStyle(styles);
  return { ...inherited, ...paragraph.attrs.overrides, id: inherited.id, name: inherited.name };
}

function markValue(mark: RichTextMark): string | number | boolean | undefined {
  return mark.attrs?.value;
}

export function resolveInlineStyle(
  paragraphStyle: ParagraphStyleProperties,
  marks: RichTextMark[] = [],
): ResolvedInlineStyle {
  const resolved: ResolvedInlineStyle = {
    fontFamily: paragraphStyle.fontFamily,
    fontSizePt: paragraphStyle.fontSizePt,
    fontWeight: paragraphStyle.fontWeight,
    italic: paragraphStyle.italic,
    underline: paragraphStyle.underline,
    color: paragraphStyle.color,
  };
  for (const mark of marks) {
    const value = markValue(mark);
    if (mark.type === "bold") resolved.fontWeight = value === false ? 400 : 700;
    else if (mark.type === "italic") resolved.italic = value === false ? false : true;
    else if (mark.type === "underline") resolved.underline = value === false ? false : true;
    else if (mark.type === "fontFamily" && typeof value === "string") resolved.fontFamily = value;
    else if (mark.type === "fontSize" && typeof value === "number") resolved.fontSizePt = value;
    else if (mark.type === "textColor" && typeof value === "string") resolved.color = value;
  }
  return resolved;
}

export function marksEqual(left: RichTextMark[] = [], right: RichTextMark[] = []): boolean {
  if (left.length !== right.length) return false;
  return left.every((mark, index) => (
    mark.type === right[index]?.type && markValue(mark) === markValue(right[index])
  ));
}

export function setMark(
  marks: RichTextMark[] = [],
  type: InlineMarkType,
  value: string | number | boolean,
): RichTextMark[] {
  const next = marks.filter((mark) => mark.type !== type);
  next.push({ type, attrs: { value } });
  return next.sort((left, right) => left.type.localeCompare(right.type));
}

export function mergeAdjacentInlineNodes(nodes: InlineTextNode[]): InlineTextNode[] {
  const merged: InlineTextNode[] = [];
  for (const node of nodes) {
    if (!node.text) continue;
    const previous = merged.at(-1);
    if (previous && marksEqual(previous.marks, node.marks)) previous.text += node.text;
    else merged.push({ ...node, ...(node.marks?.length ? { marks: node.marks } : { marks: undefined }) });
  }
  return merged;
}
