import type {
  InlineTextNode,
  ParagraphNode,
  RichTextDocument,
  StoryBlock,
  TextStory,
} from "./document";

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

function createId(): string {
  return crypto.randomUUID();
}

export function paragraphText(block: ParagraphNode): string {
  return block.content.map((node) => node.text).join("");
}

export function createParagraph(
  text = "",
  styleId = "body",
  id = createId(),
): ParagraphNode {
  const content: InlineTextNode[] = text ? [{ type: "text", text }] : [];
  return { type: "paragraph", id, attrs: { styleId }, content };
}

export function createEmptyStoryContent(): RichTextDocument {
  return { type: "doc", content: [createParagraph()] };
}

export function storyToPlainText(content: RichTextDocument): string {
  let result = "";
  content.content.forEach((block, index) => {
    if (block.type === "pageBreak") {
      result += PAGE_BREAK_CHARACTER;
      return;
    }

    result += paragraphText(block);
    if (content.content[index + 1]?.type === "paragraph") result += "\n";
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
  const blocks: StoryBlock[] = [];
  let buffer = "";

  const pushParagraph = () => {
    const previousBlock = previous?.content[blocks.length];
    blocks.push(createParagraph(
      buffer,
      previousBlock?.type === "paragraph" ? previousBlock.attrs.styleId : "body",
      previousBlock?.type === "paragraph" ? previousBlock.id : undefined,
    ));
    buffer = "";
  };

  for (const character of normalized) {
    if (character === "\n") {
      pushParagraph();
    } else if (character === PAGE_BREAK_CHARACTER) {
      pushParagraph();
      const previousBlock = previous?.content[blocks.length];
      blocks.push({
        type: "pageBreak",
        id: previousBlock?.type === "pageBreak" ? previousBlock.id : createId(),
      });
    } else {
      buffer += character;
    }
  }
  pushParagraph();

  return { type: "doc", content: blocks.length ? blocks : [createParagraph()] };
}

export function replaceStoryRange(
  content: RichTextDocument,
  selection: StorySelection,
  insertedText: string,
): StoryEditResult {
  const plainText = storyToPlainText(content);
  const from = Math.max(0, Math.min(selection.anchor, selection.head, plainText.length));
  const to = Math.max(0, Math.min(Math.max(selection.anchor, selection.head), plainText.length));
  const insertion = normalizeImportedText(insertedText);
  const nextText = `${plainText.slice(0, from)}${insertion}${plainText.slice(to)}`;
  const caret = from + insertion.length;
  return {
    content: plainTextToStoryContent(nextText, content),
    selection: { anchor: caret, head: caret },
  };
}

export function deleteFromStory(
  content: RichTextDocument,
  selection: StorySelection,
  direction: "backward" | "forward",
): StoryEditResult {
  if (selection.anchor !== selection.head) {
    return replaceStoryRange(content, selection, "");
  }
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

export function mainStory(stories: TextStory[]): TextStory {
  return stories.find((story) => story.id === MAIN_STORY_ID) ?? stories[0] ?? {
    id: MAIN_STORY_ID,
    name: "Texto principal",
    content: createEmptyStoryContent(),
  };
}
