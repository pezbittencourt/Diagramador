import type {
  InlineTextNode,
  ParagraphAlignment,
  ParagraphNode,
  RichTextDocument,
  RichTextMark,
  StoryBlock,
} from "./document";
import { mergeAdjacentInlineNodes } from "./textFormatting";
import { createParagraph } from "./textStory";

function decodeHtml(source: string): string {
  return source
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll("&nbsp;", "\u00a0")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function marksForStack(stack: string[], spanStyle = ""): RichTextMark[] {
  const marks: RichTextMark[] = [];
  const lowerStyle = spanStyle.toLowerCase();
  if (stack.some((tag) => tag === "strong" || tag === "b") || /font-weight\s*:\s*(bold|[6-9]00)/.test(lowerStyle)) {
    marks.push({ type: "bold", attrs: { value: true } });
  }
  if (stack.some((tag) => tag === "em" || tag === "i") || /font-style\s*:\s*italic/.test(lowerStyle)) {
    marks.push({ type: "italic", attrs: { value: true } });
  }
  if (stack.includes("u") || /text-decoration[^;]*underline/.test(lowerStyle)) {
    marks.push({ type: "underline", attrs: { value: true } });
  }
  const family = spanStyle.match(/font-family\s*:\s*([^;]+)/i)?.[1]?.replace(/["']/g, "").trim();
  if (family) marks.push({ type: "fontFamily", attrs: { value: family } });
  const size = spanStyle.match(/font-size\s*:\s*([\d.]+)pt/i)?.[1];
  if (size) marks.push({ type: "fontSize", attrs: { value: Number(size) } });
  const color = spanStyle.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1]?.trim();
  if (color) marks.push({ type: "textColor", attrs: { value: color } });
  return marks.sort((left, right) => left.type.localeCompare(right.type));
}

function styleAttribute(attributes: string): string {
  return attributes.match(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] ?? "";
}

function parseInlineLines(source: string, inheritedStyle = ""): InlineTextNode[][] {
  const lines: InlineTextNode[][] = [[]];
  const stack: string[] = [];
  const styleStack: string[] = [];
  const tokens = source.match(/<[^>]+>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (!token.startsWith("<")) {
      const text = decodeHtml(token);
      if (text) {
        const marks = marksForStack(
          stack,
          [...styleStack, inheritedStyle].filter(Boolean).join(";"),
        );
        lines.at(-1)?.push({ type: "text", text, ...(marks.length ? { marks } : {}) });
      }
      continue;
    }
    const closing = token.match(/^<\s*\/\s*([\w-]+)/)?.[1]?.toLowerCase();
    if (closing) {
      const index = stack.lastIndexOf(closing);
      if (index >= 0) {
        stack.splice(index, 1);
        styleStack.splice(index, 1);
      }
      continue;
    }
    const opening = token.match(/^<\s*([\w-]+)/)?.[1]?.toLowerCase();
    if (opening === "br") {
      lines.push([]);
      continue;
    }
    if (!opening || token.endsWith("/>")) continue;
    stack.push(opening);
    styleStack.push(styleAttribute(token));
  }
  return lines.map((nodes) => mergeAdjacentInlineNodes(nodes));
}

function paragraphAlignment(attributes: string): ParagraphAlignment | undefined {
  const alignment = attributes.match(/(?:text-align\s*:\s*|align\s*=\s*["']?)(left|center|right|justify)/i)?.[1];
  return alignment?.toLowerCase() as ParagraphAlignment | undefined;
}

export function docxHtmlToStoryContent(html: string): RichTextDocument {
  const blocks: StoryBlock[] = [];
  const blockPattern = /<(p|h[1-6]|li)\b([^>]*)>([\s\S]*?)<\/\1>|<(?:hr|br)\b([^>]*data-page-break[^>]*)>/gi;
  for (const match of html.matchAll(blockPattern)) {
    if (!match[1]) {
      blocks.push({ type: "pageBreak", id: crypto.randomUUID() });
      continue;
    }
    const tag = match[1].toLowerCase();
    const attributes = match[2] ?? "";
    const alignment = paragraphAlignment(attributes);
    const inheritedStyle = styleAttribute(attributes);
    const styleId = tag === "h1" ? "chapter-title" : tag.startsWith("h") ? "subtitle" : "body";
    const lines = parseInlineLines(match[3] ?? "", inheritedStyle);
    for (const content of lines) {
      const paragraph: ParagraphNode = {
        ...createParagraph("", styleId),
        content,
      };
      if (alignment) paragraph.attrs.overrides = { alignment };
      blocks.push(paragraph);
    }
  }
  return { type: "doc", content: blocks.length ? blocks : [createParagraph()] };
}
