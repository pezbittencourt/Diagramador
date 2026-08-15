import { describe, expect, it } from "vitest";
import { docxHtmlToStoryContent } from "./manuscriptImport";

describe("mapeamento rich text de DOCX", () => {
  it("J: preserva títulos simples, negrito, itálico, sublinhado e alinhamento", () => {
    const content = docxHtmlToStoryContent(
      '<h1>Capítulo</h1><p style="text-align: center"><strong>Negrito</strong> <em>itálico</em> <u>sublinhado</u></p>',
    );
    expect(content.content[0]).toMatchObject({ type: "paragraph", attrs: { styleId: "chapter-title" } });
    const paragraph = content.content[1];
    expect(paragraph).toMatchObject({
      type: "paragraph",
      attrs: { styleId: "body", overrides: { alignment: "center" } },
    });
    if (paragraph.type !== "paragraph") return;
    expect(paragraph.content.map((node) => node.marks?.[0]?.type)).toEqual([
      "bold", undefined, "italic", undefined, "underline",
    ]);
  });

  it("ignora tags desconhecidas sem perder o texto", () => {
    const content = docxHtmlToStoryContent("<p><span data-unknown='x'>Texto seguro</span></p>");
    const paragraph = content.content[0];
    expect(paragraph.type === "paragraph" && paragraph.content[0].text).toBe("Texto seguro");
  });
});
