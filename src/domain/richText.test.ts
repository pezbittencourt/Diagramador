import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "./defaultDocument";
import {
  applyInlineFormat,
  applyParagraphFormat,
  applyParagraphStyle,
  plainTextToStoryContent,
  selectionFormatting,
  storyToPlainText,
} from "./textStory";
import { resolveParagraphStyle } from "./textFormatting";

describe("transações de rich text", () => {
  it("A: aplica negrito somente à seleção", () => {
    const content = plainTextToStoryContent("um texto simples");
    const formatted = applyInlineFormat(content, { anchor: 3, head: 8 }, "bold", true);
    const paragraph = formatted.content[0];
    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type !== "paragraph") return;
    expect(paragraph.content.map((node) => [node.text, node.marks?.[0]?.type])).toEqual([
      ["um ", undefined],
      ["texto", "bold"],
      [" simples", undefined],
    ]);
    expect(storyToPlainText(formatted)).toBe("um texto simples");
  });

  it("B: aplica itálico e preserva o texto", () => {
    const content = plainTextToStoryContent("itálico local");
    const formatted = applyInlineFormat(content, { anchor: 0, head: 7 }, "italic", true);
    expect(selectionFormatting(formatted, createDefaultDocument().styles, { anchor: 0, head: 7 }).italic).toBe(true);
    expect(storyToPlainText(formatted)).toBe("itálico local");
  });

  it("E: vincula o parágrafo a um styleId reutilizável", () => {
    const content = plainTextToStoryContent("Título\nCorpo");
    const styled = applyParagraphStyle(content, { anchor: 0, head: 6 }, "chapter-title");
    expect(styled.content[0]).toMatchObject({ type: "paragraph", attrs: { styleId: "chapter-title" } });
    expect(styled.content[1]).toMatchObject({ type: "paragraph", attrs: { styleId: "body" } });
  });

  it("F: uma mudança global atualiza todos os parágrafos vinculados", () => {
    const document = createDefaultDocument();
    const content = applyParagraphStyle(
      plainTextToStoryContent("Capítulo um\nCapítulo dois"),
      { anchor: 0, head: 24 },
      "chapter-title",
    );
    const paragraphs = content.content.filter((block) => block.type === "paragraph");
    const changed = document.styles.map((style) => style.id === "chapter-title"
      ? { ...style, fontSizePt: 18 }
      : style);
    expect(paragraphs.map((paragraph) => resolveParagraphStyle(changed, paragraph).fontSizePt)).toEqual([18, 18]);
  });

  it("G: override inline sobrevive à mudança do estilo global", () => {
    const document = createDefaultDocument();
    const content = applyInlineFormat(
      plainTextToStoryContent("palavra preservada"),
      { anchor: 0, head: 7 },
      "italic",
      true,
    );
    const changed = document.styles.map((style) => style.id === "body"
      ? { ...style, fontFamily: "Arial", fontSizePt: 14 }
      : style);
    const formatting = selectionFormatting(content, changed, { anchor: 0, head: 7 });
    expect(formatting).toMatchObject({ italic: true, fontFamily: "Arial", fontSizePt: 14 });
  });

  it("mantém overrides de parágrafo separados do estilo herdado", () => {
    const document = createDefaultDocument();
    const content = applyParagraphFormat(
      plainTextToStoryContent("Parágrafo"),
      { anchor: 2, head: 2 },
      "alignment",
      "right",
    );
    const paragraph = content.content[0];
    expect(paragraph).toMatchObject({ attrs: { styleId: "body", overrides: { alignment: "right" } } });
    if (paragraph.type !== "paragraph") return;
    expect(resolveParagraphStyle(document.styles, paragraph).alignment).toBe("right");
  });
});
