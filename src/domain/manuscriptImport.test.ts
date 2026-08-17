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

  it("preserva cada linha separada por br sem concatenar palavras", () => {
    const content = docxHtmlToStoryContent(
      "<p>Primeira linha<br>Segunda linha<br class='docx-break' />Terceira linha</p>",
    );

    expect(content.content).toHaveLength(3);
    expect(content.content.map((block) => block.type === "paragraph"
      ? block.content.map((node) => node.text).join("")
      : "<page-break>")).toEqual([
      "Primeira linha",
      "Segunda linha",
      "Terceira linha",
    ]);
  });

  it("mantém marks ativas e linhas vazias ao atravessar br", () => {
    const content = docxHtmlToStoryContent(
      '<p style="font-style: italic"><strong>Antes<br><br>Depois</strong></p>',
    );

    expect(content.content).toHaveLength(3);
    const [before, empty, after] = content.content;
    expect(empty).toMatchObject({ type: "paragraph", content: [] });
    for (const paragraph of [before, after]) {
      expect(paragraph).toMatchObject({ type: "paragraph" });
      if (paragraph?.type !== "paragraph") continue;
      expect(paragraph.content[0].marks).toEqual(expect.arrayContaining([
        { type: "bold", attrs: { value: true } },
        { type: "italic", attrs: { value: true } },
      ]));
    }
  });

  it("converte itens de listas ordenadas e não ordenadas em parágrafos seguros", () => {
    const content = docxHtmlToStoryContent(
      "<ul><li>Primeiro <strong>item</strong></li><li>Segundo item</li></ul>"
      + "<ol><li>Terceiro item</li></ol>",
    );

    expect(content.content).toHaveLength(3);
    expect(content.content.map((block) => block.type === "paragraph"
      ? block.content.map((node) => node.text).join("")
      : "<page-break>")).toEqual([
      "Primeiro item",
      "Segundo item",
      "Terceiro item",
    ]);
    const first = content.content[0];
    expect(first.type === "paragraph" ? first.content[1]?.marks : undefined).toContainEqual({
      type: "bold",
      attrs: { value: true },
    });
  });

  it("propaga marks inline declaradas no style do próprio parágrafo", () => {
    const content = docxHtmlToStoryContent(
      '<p style="text-align: right; font-weight: 700; font-style: italic; '
      + "text-decoration: underline; font-family: 'Garamond'; font-size: 11.5pt; "
      + 'color: #123456">Texto marcado</p>',
    );
    const paragraph = content.content[0];

    expect(paragraph).toMatchObject({
      type: "paragraph",
      attrs: { styleId: "body", overrides: { alignment: "right" } },
    });
    if (paragraph.type !== "paragraph") return;
    expect(paragraph.content).toHaveLength(1);
    expect(paragraph.content[0].text).toBe("Texto marcado");
    expect(paragraph.content[0].marks).toEqual(expect.arrayContaining([
      { type: "bold", attrs: { value: true } },
      { type: "italic", attrs: { value: true } },
      { type: "underline", attrs: { value: true } },
      { type: "fontFamily", attrs: { value: "Garamond" } },
      { type: "fontSize", attrs: { value: 11.5 } },
      { type: "textColor", attrs: { value: "#123456" } },
    ]));
  });
});
