const fs = require("node:fs/promises");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const outputDirectory = path.join(root, ".tmp", "project-benchmark");
const projectPath = path.join(outputDirectory, "benchmark.livro");
const recoveryRoot = path.join(outputDirectory, "recovery");
const backupRoot = path.join(outputDirectory, "backups");
const basePng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XfJ8WQAAAABJRU5ErkJggg==", "base64");
const payload = Buffer.alloc(128 * 1024 - basePng.length);
let randomState = 0x9e3779b9;
for (let index = 0; index < payload.length; index += 1) {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  payload[index] = randomState & 0xff;
}
const png = Buffer.concat([basePng, payload]);

function buildDocument() {
  const paragraphText = "Este é um parágrafo editorial usado para medir salvamento, abertura e recuperação em um livro extenso. ";
  const paragraphs = Array.from({ length: 1_600 }, (_, index) => ({
    type: "paragraph",
    id: `paragraph-${index}`,
    attrs: { styleId: "body" },
    content: [{ type: "text", text: `${index + 1}. ${paragraphText}` }],
  }));
  const assets = Array.from({ length: 40 }, (_, index) => ({
    id: `asset-${index}`,
    fileName: `imagem-${index}.png`,
    mimeType: "image/png",
    encoding: "base64",
    data: png.toString("base64"),
    pixelWidth: 1,
    pixelHeight: 1,
  }));
  const pages = Array.from({ length: 100 }, (_, index) => ({
    id: `page-${index}`,
    objects: index < 40 ? [{
      id: `image-${index}`,
      type: "image",
      anchorMode: "page",
      assetId: `asset-${index}`,
      x: 10,
      y: 10,
      width: 30,
      height: 30,
      zIndex: 0,
      originalAspectRatio: 1,
      lockAspectRatio: true,
    }] : [],
  }));
  return {
    schemaVersion: 3,
    id: "benchmark-document",
    title: "Benchmark 0.9",
    createdAt: "2026-08-21T12:00:00.000Z",
    updatedAt: new Date().toISOString(),
    pageSetup: {
      preset: "A5", width: 148, height: 210, mirroredMargins: true,
      margins: { top: 18, bottom: 20, inner: 20, outer: 15 },
      bleed: { top: 3, bottom: 3, inner: 3, outer: 3 },
    },
    viewSettings: { showMargins: true, showBleed: true, showRulers: true, showCustomGuides: true, snapEnabled: true, viewMode: "spread" },
    guides: [],
    pages,
    stories: [{ id: "main-story", name: "Texto principal", content: { type: "doc", content: paragraphs } }],
    styles: [{
      id: "body", name: "Corpo", fontFamily: "Georgia", fontSizePt: 11, fontWeight: 400,
      italic: false, underline: false, color: "#222520", lineHeight: 1.35, alignment: "justify",
      spaceBeforePt: 0, spaceAfterPt: 6, firstLineIndentMm: 5, leftIndentMm: 0, rightIndentMm: 0,
    }],
    numbering: {
      ranges: [{ id: "main", fromPhysicalIndex: 0, logicalStart: 1, format: "arabic" }],
      display: { defaultVisible: true, logicalRanges: [], hiddenLogicalNumbers: [], hiddenPageIds: [] },
      placement: { vertical: "bottom", horizontal: "outer", mirrorOnFacingPages: true },
    },
    assets,
  };
}

async function measured(action) {
  const start = performance.now();
  const value = await action();
  return { value, durationMs: performance.now() - start };
}

async function main() {
  const projectFiles = await import(pathToFileURL(path.join(root, "dist-electron", "projectFiles.js")).href);
  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(outputDirectory, { recursive: true });
  const document = buildDocument();
  const json = JSON.stringify(document);
  const save = await measured(() => projectFiles.writeLivroFile(projectPath, json));
  const open = await measured(() => projectFiles.openProjectFile(projectPath));
  const autosave = await measured(() => projectFiles.writeRecovery(recoveryRoot, json, projectPath));
  const backup = await measured(() => projectFiles.createBackup(backupRoot, document.id, projectPath));
  const livroBytes = (await fs.stat(projectPath)).size;
  const report = {
    pages: document.pages.length,
    characters: document.stories[0].content.content.reduce((sum, block) => sum + block.content[0].text.length, 0),
    images: document.assets.length,
    jsonBase64Bytes: Buffer.byteLength(json),
    livroBytes,
    sizeReductionPercent: Number(((1 - livroBytes / Buffer.byteLength(json)) * 100).toFixed(1)),
    saveMs: Number(save.durationMs.toFixed(1)),
    openMs: Number(open.durationMs.toFixed(1)),
    autosaveMs: Number(autosave.durationMs.toFixed(1)),
    backupMs: Number(backup.durationMs.toFixed(1)),
    warnings: open.value.warnings,
  };
  await fs.writeFile(path.join(outputDirectory, "report.json"), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
