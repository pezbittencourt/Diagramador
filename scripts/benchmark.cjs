const { performance } = require("node:perf_hooks");

async function run() {
  const { createDefaultDocument } = await import("../.tmp/benchmark/domain/defaultDocument.js");
  const { plainTextToStoryContent } = await import("../.tmp/benchmark/domain/textStory.js");
  const { composeStory } = await import("../.tmp/benchmark/layout/pagination.js");
  const { DeterministicTextMeasurer } = await import("../.tmp/benchmark/layout/textMeasurement.js");
  const document = createDefaultDocument();
  const text = Array.from({ length: 18000 }, (_, index) =>
    index % 140 === 0 ? "\n\nNovo capítulo. " : "palavra ",
  ).join("");
  const content = plainTextToStoryContent(text);
  const start = performance.now();
  const snapshot = composeStory({
    storyId: "main-story",
    content,
    pageSetup: document.pageSetup,
    styles: document.styles,
    measurer: new DeterministicTextMeasurer(),
  });
  const elapsed = performance.now() - start;
  console.log(JSON.stringify({
    characters: text.length,
    paragraphs: content.content.length,
    pages: snapshot.pages.length,
    elapsedMs: Number(elapsed.toFixed(2)),
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
