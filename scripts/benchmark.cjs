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
  const { synchronizePhysicalPages } = await import("../.tmp/benchmark/layout/pageSynchronization.js");
  const { createSpreads } = await import("../.tmp/benchmark/layout/spreads.js");
  const {
    millimetersToPixels,
    resizePositionedObject,
    snapObjectPosition,
  } = await import("../.tmp/benchmark/domain/objectGeometry.js");
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
  document.pages = synchronizePhysicalPages(document.pages, initial.value.pages.length);
  const embeddedPayload = Buffer.alloc(128 * 1024, 31).toString("base64");
  for (let index = 0; index < 40; index += 1) {
    const assetId = `benchmark-asset-${index}`;
    document.assets.push({
      id: assetId,
      fileName: `benchmark-${index}.jpg`,
      mimeType: "image/jpeg",
      encoding: "base64",
      data: embeddedPayload,
      pixelWidth: 4000,
      pixelHeight: 3000,
    });
    document.pages[(index * 7) % document.pages.length].objects.push({
      id: `benchmark-image-${index}`,
      type: "image",
      anchorMode: "page",
      assetId,
      x: index % 3 === 0 ? -3 : 12 + index % 20,
      y: 18 + index % 30,
      width: 70,
      height: 52.5,
      originalAspectRatio: 4 / 3,
      lockAspectRatio: true,
      zIndex: index,
    });
  }
  const allImages = () => document.pages.flatMap((page) => page.objects)
    .filter((object) => object.type === "image");
  const initialVisualProjection = await measure(() => allImages().map((object) => ({
    left: millimetersToPixels(object.x, 0.72),
    top: millimetersToPixels(object.y, 0.72),
    width: millimetersToPixels(object.width, 0.72),
    height: millimetersToPixels(object.height, 0.72),
  })));
  const drag = await measure(() => {
    let checksum = 0;
    for (let iteration = 0; iteration < 1000; iteration += 1) {
      const object = allImages()[iteration % 40];
      const result = snapObjectPosition(object, object.x + 0.2, object.y + 0.3, {
        pageWidth: document.pageSetup.width,
        pageHeight: document.pageSetup.height,
        margins: { top: 18, right: 15, bottom: 20, left: 20 },
        bleed: { top: 3, right: 3, bottom: 3, left: 3 },
        verticalGuides: [35, 74, 110],
        horizontalGuides: [50, 105, 170],
      }, 0.72, true);
      checksum += result.x + result.y;
    }
    return checksum;
  });
  const resize = await measure(() => {
    let object = allImages()[0];
    for (let iteration = 0; iteration < 1000; iteration += 1) {
      object = resizePositionedObject(object, "se", 0.01, 0.01);
    }
    return object.width;
  });
  const zoomProjection = await measure(() => [0.5, 1, 1.5].flatMap((scale) =>
    allImages().map((object) => millimetersToPixels(object.x + object.width, scale))));
  const viewModeSwitch = await measure(() => ({
    spreads: createSpreads(document.pages.length),
    singlePage: document.pages[Math.floor(document.pages.length / 2)],
  }));
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
    positionedImages: allImages().length,
    initialComposeMs: initial.elapsedMs,
    typingTransactionAndReflowMs: typing.elapsedMs,
    globalStyleReflowMs: globalStyle.elapsedMs,
    openProjectAndComposeMs: opening.elapsedMs,
    initialVisualProjectionMs: initialVisualProjection.elapsedMs,
    drag1000UpdatesMs: drag.elapsedMs,
    resize1000UpdatesMs: resize.elapsedMs,
    zoomProjectionThreeLevelsMs: zoomProjection.elapsedMs,
    spreadSingleSwitchProjectionMs: viewModeSwitch.elapsedMs,
    serializedBytes: Buffer.byteLength(serialized),
    docxImportMs: docx.elapsedMs,
    docxCharacters: docx.value.text.length,
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
