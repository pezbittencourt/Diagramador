const { performance } = require("node:perf_hooks");
const path = require("node:path");

async function measure(task) {
  const startedAt = performance.now();
  const value = await task();
  return { value, elapsedMs: Number((performance.now() - startedAt).toFixed(2)) };
}

async function run() {
  const { createDefaultDocument } = await import("../.tmp/benchmark/domain/defaultDocument.js");
  const {
    applyInlineFormat,
    createParagraph,
    replaceStoryRange,
    storyToPlainText,
  } = await import("../.tmp/benchmark/domain/textStory.js");
  const { composeStory } = await import("../.tmp/benchmark/layout/pagination.js");
  const { DeterministicTextMeasurer } = await import("../.tmp/benchmark/layout/textMeasurement.js");
  const { parseDocument, serializeDocument } = await import("../.tmp/benchmark/persistence/documentCodec.js");
  const { importManuscriptFile } = await import("../dist-electron/manuscriptFiles.js");

  const document = createDefaultDocument();
  const blocks = Array.from({ length: 720 }, (_, index) => {
    const isChapter = index % 60 === 0;
    const isSubtitle = !isChapter && index % 15 === 0;
    const isQuote = index % 23 === 0;
    const styleId = isChapter ? "chapter-title" : isSubtitle ? "subtitle" : isQuote ? "quote" : "body";
    const text = isChapter
      ? `Capítulo ${index / 60 + 1}`
      : `${isQuote ? "Citação editorial. " : ""}${"Parágrafo de benchmark com palavras e ritmo tipográfico. ".repeat(4)}`;
    return createParagraph(text, styleId);
  });
  let content = { type: "doc", content: blocks };
  content = applyInlineFormat(content, { anchor: 0, head: 8 }, "bold", true);
  document.stories[0].content = content;
  const measurer = new DeterministicTextMeasurer();
  const compose = (storyContent, styles = document.styles) => composeStory({
    storyId: "main-story",
    content: storyContent,
    pageSetup: document.pageSetup,
    styles,
    measurer,
  });

  const initial = await measure(() => compose(content));
  const sourceLength = storyToPlainText(content).length;
  const typing = await measure(() => {
    const edited = replaceStoryRange(
      content,
      { anchor: Math.floor(sourceLength / 2), head: Math.floor(sourceLength / 2) },
      "Edição ",
    ).content;
    return compose(edited);
  });
  const changedStyles = document.styles.map((style) => style.id === "body"
    ? { ...style, fontSizePt: 11.5, lineHeight: 1.4 }
    : style);
  const globalStyle = await measure(() => compose(content, changedStyles));
  const serialized = serializeDocument(document);
  const opening = await measure(() => {
    const opened = parseDocument(serialized);
    return compose(opened.stories[0].content, opened.styles);
  });
  const docx = await measure(() => importManuscriptFile(
    path.resolve("node_modules/mammoth/test/test-data/underline.docx"),
  ));

  console.log(JSON.stringify({
    characters: sourceLength,
    paragraphs: blocks.length,
    stylesUsed: [...new Set(blocks.map((block) => block.attrs.styleId))],
    pages: initial.value.pages.length,
    initialComposeMs: initial.elapsedMs,
    typingTransactionAndReflowMs: typing.elapsedMs,
    globalStyleReflowMs: globalStyle.elapsedMs,
    openProjectAndComposeMs: opening.elapsedMs,
    serializedBytes: Buffer.byteLength(serialized),
    docxImportMs: docx.elapsedMs,
    docxCharacters: docx.value.text.length,
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
