import type {
  InlineTextNode,
  ParagraphAlignment,
  ParagraphNode,
  ParagraphOverrides,
  ParagraphStyle,
  RichTextDocument,
  RichTextMark,
  StoryBlock,
  TextStory,
} from "./document";
import {
  mergeAdjacentInlineNodes,
  resolveInlineStyle,
  resolveParagraphStyle,
  setMark,
  type InlineMarkType,
  type ResolvedInlineStyle,
} from "./textFormatting";

export const MAIN_STORY_ID = "main-story";
export const PAGE_BREAK_CHARACTER = "\f";

export interface StorySelection {
  anchor: number;
  head: number;
}

export interface StoryEditResult {
  content: RichTextDocument;
  selection: StorySelection;
}

export interface SelectionFormatting {
  fontFamily: string | null;
  fontSizePt: number | null;
  fontWeight: number | null;
  italic: boolean | null;
  underline: boolean | null;
  color: string | null;
  styleId: string | null;
  alignment: ParagraphAlignment | null;
  lineHeight: number | null;
  spaceBeforePt: number | null;
  spaceAfterPt: number | null;
  firstLineIndentMm: number | null;
  leftIndentMm: number | null;
  rightIndentMm: number | null;
  mixedInline: boolean;
}

export type ParagraphFormatProperty = keyof Pick<
  ParagraphOverrides,
  | "alignment"
  | "lineHeight"
  | "spaceBeforePt"
  | "spaceAfterPt"
  | "firstLineIndentMm"
  | "leftIndentMm"
  | "rightIndentMm"
>;

interface ParagraphMetadata {
  id: string;
  attrs: ParagraphNode["attrs"];
}

interface TextToken {
  kind: "text";
  value: string;
  marks: RichTextMark[];
  paragraph: ParagraphMetadata;
}

interface ParagraphBreakToken {
  kind: "paragraphBreak";
  value: "\n";
  left?: ParagraphMetadata;
  right?: ParagraphMetadata;
}

interface PageBreakToken {
  kind: "pageBreak";
  value: typeof PAGE_BREAK_CHARACTER;
  id: string;
  left?: ParagraphMetadata;
  right?: ParagraphMetadata;
}

type StoryToken = TextToken | ParagraphBreakToken | PageBreakToken;

function createId(): string {
  return crypto.randomUUID();
}

function cloneMetadata(paragraph: ParagraphNode): ParagraphMetadata {
  return {
    id: paragraph.id,
    attrs: {
      styleId: paragraph.attrs.styleId,
      ...(paragraph.attrs.overrides ? { overrides: { ...paragraph.attrs.overrides } } : {}),
    },
  };
}

function defaultMetadata(id = createId()): ParagraphMetadata {
  return { id, attrs: { styleId: "body" } };
}

function paragraphBefore(blocks: StoryBlock[], index: number): ParagraphMetadata | undefined {
  const block = blocks[index - 1];
  return block?.type === "paragraph" ? cloneMetadata(block) : undefined;
}

function paragraphAfter(blocks: StoryBlock[], index: number): ParagraphMetadata | undefined {
  const block = blocks[index + 1];
  return block?.type === "paragraph" ? cloneMetadata(block) : undefined;
}

function storyTokens(content: RichTextDocument): StoryToken[] {
  const tokens: StoryToken[] = [];
  content.content.forEach((block, blockIndex) => {
    if (block.type === "pageBreak") {
      tokens.push({
        kind: "pageBreak",
        value: PAGE_BREAK_CHARACTER,
        id: block.id,
        left: paragraphBefore(content.content, blockIndex),
        right: paragraphAfter(content.content, blockIndex),
      });
      return;
    }
    const paragraph = cloneMetadata(block);
    for (const inline of block.content) {
      for (let index = 0; index < inline.text.length; index += 1) {
        tokens.push({
          kind: "text",
          value: inline.text[index],
          marks: inline.marks ? [...inline.marks] : [],
          paragraph,
        });
      }
    }
    const next = content.content[blockIndex + 1];
    if (next?.type === "paragraph") {
      tokens.push({
        kind: "paragraphBreak",
        value: "\n",
        left: paragraph,
        right: cloneMetadata(next),
      });
    }
  });
  return tokens;
}

function metadataAtOffset(content: RichTextDocument, offset: number): ParagraphMetadata {
  let position = 0;
  let lastParagraph: ParagraphMetadata | undefined;
  for (let index = 0; index < content.content.length; index += 1) {
    const block = content.content[index];
    if (block.type === "pageBreak") {
      if (offset === position) {
        return paragraphBefore(content.content, index)
          ?? paragraphAfter(content.content, index)
          ?? lastParagraph
          ?? defaultMetadata();
      }
      position += 1;
      continue;
    }
    const metadata = cloneMetadata(block);
    const end = position + paragraphText(block).length;
    if (offset >= position && offset <= end) return metadata;
    lastParagraph = metadata;
    position = end;
    if (content.content[index + 1]?.type === "paragraph") position += 1;
  }
  return lastParagraph ?? defaultMetadata();
}

function continuationMetadata(): ParagraphMetadata {
  return defaultMetadata();
}

function insertedTokens(
  source: string,
  paragraph: ParagraphMetadata,
  marks: RichTextMark[],
): StoryToken[] {
  const tokens: StoryToken[] = [];
  let current = paragraph;
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index];
    if (value === "\n") {
      const next = continuationMetadata();
      tokens.push({ kind: "paragraphBreak", value, left: current, right: next });
      current = next;
    } else if (value === PAGE_BREAK_CHARACTER) {
      const next = continuationMetadata();
      tokens.push({
        kind: "pageBreak",
        value,
        id: createId(),
        left: current,
        right: next,
      });
      current = next;
    } else {
      tokens.push({ kind: "text", value, marks: [...marks], paragraph: current });
    }
  }
  return tokens;
}

function tokensToContent(tokens: StoryToken[], fallback: ParagraphMetadata): RichTextDocument {
  const blocks: StoryBlock[] = [];
  let metadata: ParagraphMetadata | undefined;
  let inlines: InlineTextNode[] = [];

  const pushText = (value: string, marks: RichTextMark[]) => {
    const previous = inlines.at(-1);
    if (previous && JSON.stringify(previous.marks ?? []) === JSON.stringify(marks)) {
      previous.text += value;
    } else {
      inlines.push({ type: "text", text: value, ...(marks.length ? { marks } : {}) });
    }
  };
  const pushParagraph = (preferred?: ParagraphMetadata) => {
    const chosen = metadata ?? preferred ?? fallback;
    blocks.push({
      type: "paragraph",
      id: chosen.id,
      attrs: {
        styleId: chosen.attrs.styleId,
        ...(chosen.attrs.overrides ? { overrides: { ...chosen.attrs.overrides } } : {}),
      },
      content: mergeAdjacentInlineNodes(inlines),
    });
    metadata = undefined;
    inlines = [];
  };

  for (const token of tokens) {
    if (token.kind === "text") {
      metadata ??= token.paragraph;
      pushText(token.value, token.marks);
    } else if (token.kind === "paragraphBreak") {
      pushParagraph(token.left);
      metadata = token.right;
    } else {
      pushParagraph(token.left);
      blocks.push({ type: "pageBreak", id: token.id });
      metadata = token.right;
    }
  }
  pushParagraph(metadata ?? fallback);
  return { type: "doc", content: blocks };
}

function normalizedSelection(content: RichTextDocument, selection: StorySelection) {
  const length = storyToPlainText(content).length;
  return {
    from: Math.max(0, Math.min(selection.anchor, selection.head, length)),
    to: Math.max(0, Math.min(Math.max(selection.anchor, selection.head), length)),
  };
}

export function paragraphText(block: ParagraphNode): string {
  return block.content.map((node) => node.text).join("");
}

export function createParagraph(
  text = "",
  styleId = "body",
  id = createId(),
  marks: RichTextMark[] = [],
): ParagraphNode {
  const content: InlineTextNode[] = text
    ? [{ type: "text", text, ...(marks.length ? { marks } : {}) }]
    : [];
  return { type: "paragraph", id, attrs: { styleId }, content };
}

export function createEmptyStoryContent(): RichTextDocument {
  return { type: "doc", content: [createParagraph()] };
}

export function storyToPlainText(content: RichTextDocument): string {
  let result = "";
  content.content.forEach((block, index) => {
    if (block.type === "pageBreak") result += PAGE_BREAK_CHARACTER;
    else {
      result += paragraphText(block);
      if (content.content[index + 1]?.type === "paragraph") result += "\n";
    }
  });
  return result;
}

export function normalizeImportedText(source: string): string {
  return source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[\u000B\u2028\u2029]/g, "\n");
}

export function plainTextToStoryContent(
  source: string,
  previous?: RichTextDocument,
): RichTextDocument {
  const normalized = normalizeImportedText(source);
  const fallbackBlock = previous?.content.find(
    (block): block is ParagraphNode => block.type === "paragraph",
  );
  const fallback = fallbackBlock ? cloneMetadata(fallbackBlock) : defaultMetadata();
  return tokensToContent(insertedTokens(normalized, fallback, []), fallback);
}

export function replaceStoryRange(
  content: RichTextDocument,
  selection: StorySelection,
  insertedText: string,
  marks: RichTextMark[] = marksAtOffset(content, selection.head),
): StoryEditResult {
  const { from, to } = normalizedSelection(content, selection);
  const insertion = normalizeImportedText(insertedText);
  const fallback = metadataAtOffset(content, from);
  const tokens = storyTokens(content);
  const replacement = insertedTokens(insertion, fallback, marks);
  const nextTokens = [...tokens.slice(0, from), ...replacement, ...tokens.slice(to)];
  const caret = from + insertion.length;
  return {
    content: tokensToContent(nextTokens, fallback),
    selection: { anchor: caret, head: caret },
  };
}

export function deleteFromStory(
  content: RichTextDocument,
  selection: StorySelection,
  direction: "backward" | "forward",
): StoryEditResult {
  if (selection.anchor !== selection.head) return replaceStoryRange(content, selection, "");
  const length = storyToPlainText(content).length;
  const caret = Math.max(0, Math.min(selection.head, length));
  if (direction === "backward" && caret > 0) {
    return replaceStoryRange(content, { anchor: caret - 1, head: caret }, "");
  }
  if (direction === "forward" && caret < length) {
    return replaceStoryRange(content, { anchor: caret, head: caret + 1 }, "");
  }
  return { content, selection: { anchor: caret, head: caret } };
}

export function marksAtOffset(content: RichTextDocument, offset: number): RichTextMark[] {
  const tokens = storyTokens(content);
  const direct = tokens[offset];
  if (direct?.kind === "text") return [...direct.marks];
  const previous = tokens[offset - 1];
  return previous?.kind === "text" ? [...previous.marks] : [];
}

export function applyInlineFormat(
  content: RichTextDocument,
  selection: StorySelection,
  type: InlineMarkType,
  value: string | number | boolean,
): RichTextDocument {
  const { from, to } = normalizedSelection(content, selection);
  if (from === to) return content;
  const fallback = metadataAtOffset(content, from);
  const tokens = storyTokens(content).map((token, index) => (
    index >= from && index < to && token.kind === "text"
      ? { ...token, marks: setMark(token.marks, type, value) }
      : token
  ));
  return tokensToContent(tokens, fallback);
}

function selectedParagraphIds(
  content: RichTextDocument,
  selection: StorySelection,
): Set<string> {
  const { from, to } = normalizedSelection(content, selection);
  const ids = new Set<string>();
  let position = 0;
  for (let index = 0; index < content.content.length; index += 1) {
    const block = content.content[index];
    if (block.type === "pageBreak") {
      position += 1;
      continue;
    }
    const end = position + paragraphText(block).length;
    const containsCaret = from === to && from >= position && from <= end;
    const overlaps = from !== to && from <= end && to >= position;
    if (containsCaret || overlaps) ids.add(block.id);
    position = end;
    if (content.content[index + 1]?.type === "paragraph") position += 1;
  }
  return ids;
}

export function applyParagraphStyle(
  content: RichTextDocument,
  selection: StorySelection,
  styleId: string,
): RichTextDocument {
  const ids = selectedParagraphIds(content, selection);
  return {
    ...content,
    content: content.content.map((block) => block.type === "paragraph" && ids.has(block.id)
      ? { ...block, attrs: { ...block.attrs, styleId } }
      : block),
  };
}

export function applyParagraphFormat(
  content: RichTextDocument,
  selection: StorySelection,
  property: ParagraphFormatProperty,
  value: ParagraphOverrides[ParagraphFormatProperty],
): RichTextDocument {
  const ids = selectedParagraphIds(content, selection);
  return {
    ...content,
    content: content.content.map((block) => block.type === "paragraph" && ids.has(block.id)
      ? {
          ...block,
          attrs: {
            ...block.attrs,
            overrides: { ...block.attrs.overrides, [property]: value },
          },
        }
      : block),
  };
}

function commonValue<T>(values: T[]): T | null {
  const first = values[0];
  return values.every((value) => value === first) ? first : null;
}

export function selectionFormatting(
  content: RichTextDocument,
  styles: ParagraphStyle[],
  selection: StorySelection,
  typingMarks?: RichTextMark[],
): SelectionFormatting {
  const ids = selectedParagraphIds(content, selection);
  const paragraphs = content.content.filter(
    (block): block is ParagraphNode => block.type === "paragraph" && ids.has(block.id),
  );
  const fallbackParagraph = paragraphs[0]
    ?? content.content.find((block): block is ParagraphNode => block.type === "paragraph")
    ?? createParagraph();
  const resolvedParagraphs = paragraphs.length
    ? paragraphs.map((paragraph) => resolveParagraphStyle(styles, paragraph))
    : [resolveParagraphStyle(styles, fallbackParagraph)];
  const { from, to } = normalizedSelection(content, selection);
  const inlineStyles: ResolvedInlineStyle[] = [];
  if (from === to) {
    inlineStyles.push(resolveInlineStyle(
      resolveParagraphStyle(styles, fallbackParagraph),
      typingMarks ?? marksAtOffset(content, from),
    ));
  } else {
    const tokens = storyTokens(content);
    for (let index = from; index < to; index += 1) {
      const token = tokens[index];
      if (token?.kind !== "text") continue;
      const paragraph = content.content.find(
        (block): block is ParagraphNode => block.type === "paragraph" && block.id === token.paragraph.id,
      ) ?? fallbackParagraph;
      inlineStyles.push(resolveInlineStyle(resolveParagraphStyle(styles, paragraph), token.marks));
    }
  }
  if (!inlineStyles.length) {
    inlineStyles.push(resolveInlineStyle(resolvedParagraphs[0], typingMarks ?? []));
  }
  const fontFamily = commonValue(inlineStyles.map((style) => style.fontFamily));
  const fontSizePt = commonValue(inlineStyles.map((style) => style.fontSizePt));
  const fontWeight = commonValue(inlineStyles.map((style) => style.fontWeight));
  const italic = commonValue(inlineStyles.map((style) => style.italic));
  const underline = commonValue(inlineStyles.map((style) => style.underline));
  const color = commonValue(inlineStyles.map((style) => style.color));
  return {
    fontFamily,
    fontSizePt,
    fontWeight,
    italic,
    underline,
    color,
    styleId: commonValue(paragraphs.map((paragraph) => paragraph.attrs.styleId)),
    alignment: commonValue(resolvedParagraphs.map((style) => style.alignment)),
    lineHeight: commonValue(resolvedParagraphs.map((style) => style.lineHeight)),
    spaceBeforePt: commonValue(resolvedParagraphs.map((style) => style.spaceBeforePt)),
    spaceAfterPt: commonValue(resolvedParagraphs.map((style) => style.spaceAfterPt)),
    firstLineIndentMm: commonValue(resolvedParagraphs.map((style) => style.firstLineIndentMm)),
    leftIndentMm: commonValue(resolvedParagraphs.map((style) => style.leftIndentMm)),
    rightIndentMm: commonValue(resolvedParagraphs.map((style) => style.rightIndentMm)),
    mixedInline: [fontFamily, fontSizePt, fontWeight, italic, underline, color].some(
      (value) => value === null,
    ),
  };
}

export function mainStory(stories: TextStory[]): TextStory {
  return stories.find((story) => story.id === MAIN_STORY_ID) ?? stories[0] ?? {
    id: MAIN_STORY_ID,
    name: "Texto principal",
    content: createEmptyStoryContent(),
  };
}
