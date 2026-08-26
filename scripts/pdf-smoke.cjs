const { app, BrowserWindow, ipcMain, nativeImage } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const root = path.resolve(__dirname, "..");
const outputDirectory = path.join(root, ".tmp", "pdf-smoke");
const userDataPath = path.join(os.tmpdir(), `livro-studio-pdf-smoke-${process.pid}`);
const outputPaths = [
  path.join(outputDirectory, "a5-no-bleed.pdf"),
  path.join(outputDirectory, "a5-no-bleed-single-200.pdf"),
  path.join(outputDirectory, "a5-with-bleed.pdf"),
  path.join(outputDirectory, "physical-pages-15-30.pdf"),
];
let exportIndex = 0;
const exportSurfaces = [];
let pickedImageIndex = 0;
let rasterFixtures = [];

const fixtureHtml = [
  "<h1>TÍTULO DE REFERÊNCIA</h1>",
  "<h2>SUBTÍTULO EDITORIAL</h2>",
  '<p>Texto regular, <strong>NEGRITO</strong>, <em>ITÁLICO</em>, <u>SUBLINHADO</u> e '
    + '<span style="font-size: 13pt; color: #a43b32">COLORIDO GRANDE</span>.</p>',
  "<p>CITAÇÃO DE REFERÊNCIA para validar o estilo editorial próprio.</p>",
  "<p>DEDICATÓRIA DE REFERÊNCIA para validar outro estilo global.</p>",
  '<br data-page-break="true">',
  "<p>MARCADOR APÓS QUEBRA MANUAL.</p>",
  ...Array.from({ length: 180 }, (_, index) =>
    `<p>Parágrafo ${index + 1}. Texto editorial com acentuação, pontuação e palavras suficientes `
      + "para validar a composição, o alinhamento justificado e a continuidade entre páginas. ".repeat(4)
      + "</p>"),
].join("");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("in-process-gpu");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.setPath("userData", userDataPath);

ipcMain.on("app:get-version", (event) => { event.returnValue = app.getVersion(); });

ipcMain.handle("document:open", () => ({ canceled: true }));
ipcMain.handle("document:save", () => ({ canceled: true }));
ipcMain.handle("document:autosave", () => ({ skipped: true }));
ipcMain.handle("recovery:list", () => []);
ipcMain.handle("backup:recover", () => ({ canceled: true, unavailable: true }));
ipcMain.handle("document:confirm-unsaved", () => "discard");
ipcMain.handle("manuscript:confirm-replace", () => true);
ipcMain.handle("manuscript:import", () => ({
  canceled: false,
  manuscript: {
    filePath: "fixture-editorial.docx",
    fileName: "fixture-editorial.docx",
    format: "docx",
    text: "",
    html: fixtureHtml,
    warnings: [],
  },
}));
ipcMain.handle("asset:pick-image", () => {
  const image = rasterFixtures[pickedImageIndex % rasterFixtures.length];
  pickedImageIndex += 1;
  if (!image) throw new Error("Raster fixtures were not initialized.");
  return { canceled: false, image };
});
ipcMain.on("document:set-dirty", () => undefined);
ipcMain.on("document:set-operation-busy", () => undefined);
ipcMain.on("document:new-session", () => undefined);
ipcMain.on("document:finish-close", () => undefined);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function firstMediaBox(buffer) {
  const source = buffer.toString("latin1");
  const match = /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/.exec(source);
  if (!match) throw new Error("MediaBox was not found in the generated PDF.");
  return {
    width: Number(match[3]) - Number(match[1]),
    height: Number(match[4]) - Number(match[2]),
  };
}

function closeTo(actual, expected, tolerance = 0.8) {
  return Math.abs(actual - expected) <= tolerance;
}

function createFixtureNativeImage(seed, transparent) {
  const width = 96;
  const height = 72;
  const bitmap = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      bitmap[offset] = (x * 3 + seed * 41) % 256;
      bitmap[offset + 1] = (y * 4 + seed * 67) % 256;
      bitmap[offset + 2] = (210 - seed * 35 + x) % 256;
      bitmap[offset + 3] = transparent && x < width / 2 ? 112 : 255;
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width, height });
}

async function findExecutable(directory, fileName, depth = 5) {
  if (depth < 0) return undefined;
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return undefined;
  }
  const match = entries.find((entry) => entry.isFile()
    && entry.name.toLowerCase() === fileName.toLowerCase());
  if (match) return path.join(directory, match.name);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nested = await findExecutable(path.join(directory, entry.name), fileName, depth - 1);
    if (nested) return nested;
  }
  return undefined;
}

function compareRasterImages(preview, rendered, width, height) {
  const left = preview.resize({ width, height, quality: "best" }).toBitmap();
  const right = rendered.resize({ width, height, quality: "best" }).toBitmap();
  const diff = Buffer.alloc(width * height * 4);
  let absoluteDifference = 0;
  let changedPixels = 0;
  for (let offset = 0; offset < left.length; offset += 4) {
    const blue = Math.abs(left[offset] - right[offset]);
    const green = Math.abs(left[offset + 1] - right[offset + 1]);
    const red = Math.abs(left[offset + 2] - right[offset + 2]);
    const maximum = Math.max(red, green, blue);
    absoluteDifference += red + green + blue;
    if (maximum > 40) changedPixels += 1;
    diff[offset] = 0;
    diff[offset + 1] = 0;
    diff[offset + 2] = Math.min(255, maximum * 4);
    diff[offset + 3] = 255;
  }
  return {
    meanAbsoluteError: absoluteDifference / (width * height * 3),
    changedPixelRatio: changedPixels / (width * height),
    diffImage: nativeImage.createFromBitmap(diff, { width, height }),
  };
}

function rasterContentBounds(image) {
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (bitmap[offset] > 205 && bitmap[offset + 1] > 205 && bitmap[offset + 2] > 205) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

function decodeXmlText(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hexadecimal) =>
      String.fromCodePoint(Number.parseInt(hexadecimal, 16)))
    .replace(/&#([0-9]+);/g, (_match, decimal) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function normalizedText(value) {
  return value.replaceAll("\u200b", "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function xmlAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(/([A-Za-z][\w:-]*)="([^"]*)"/g)) {
    attributes[match[1]] = decodeXmlText(match[2]);
  }
  return attributes;
}

function parseBboxLayout(source) {
  const pageMatch = /<page\b([^>]*)>([\s\S]*?)<\/page>/i.exec(source);
  if (!pageMatch) throw new Error("Poppler bbox-layout did not contain a page.");
  const pageAttributes = xmlAttributes(pageMatch[1]);
  const page = {
    width: Number(pageAttributes.width),
    height: Number(pageAttributes.height),
    lines: [],
  };
  if (!(page.width > 0) || !(page.height > 0)) {
    throw new Error(`Poppler bbox-layout returned an invalid page size: ${JSON.stringify(pageAttributes)}`);
  }

  for (const lineMatch of pageMatch[2].matchAll(/<line\b([^>]*)>([\s\S]*?)<\/line>/gi)) {
    const lineAttributes = xmlAttributes(lineMatch[1]);
    const words = [];
    for (const wordMatch of lineMatch[2].matchAll(/<word\b([^>]*)>([\s\S]*?)<\/word>/gi)) {
      const attributes = xmlAttributes(wordMatch[1]);
      const word = {
        text: normalizedText(decodeXmlText(wordMatch[2].replace(/<[^>]+>/g, ""))),
        xMin: Number(attributes.xMin),
        yMin: Number(attributes.yMin),
        xMax: Number(attributes.xMax),
        yMax: Number(attributes.yMax),
      };
      if (word.text && [word.xMin, word.yMin, word.xMax, word.yMax].every(Number.isFinite)) {
        words.push(word);
      }
    }
    if (!words.length) continue;
    page.lines.push({
      text: normalizedText(words.map((word) => word.text).join(" ")),
      xMin: Number(lineAttributes.xMin),
      yMin: Number(lineAttributes.yMin),
      xMax: Number(lineAttributes.xMax),
      yMax: Number(lineAttributes.yMax),
      words,
    });
  }
  if (!page.lines.length) throw new Error("Poppler bbox-layout did not contain selectable text lines.");
  return page;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function compareDomAndPdfGeometry(domPage, pdfPage) {
  const xScale = pdfPage.width / domPage.trimWidth;
  const yScale = pdfPage.height / domPage.trimHeight;
  const pairs = [];
  const expectedFolio = normalizedText(domPage.folio ?? "");
  const folioLines = expectedFolio
    ? pdfPage.lines.filter((line) => line.text === expectedFolio)
    : [];
  assert(folioLines.length === (expectedFolio ? 1 : 0),
    `Preview/PDF folio text diverged: ${JSON.stringify({
      expectedFolio,
      found: folioLines.map((line) => line.text),
    })}`);
  const pdfContentLines = expectedFolio
    ? pdfPage.lines.filter((line) => line.text !== expectedFolio)
    : pdfPage.lines;
  assert(domPage.lines.length === pdfContentLines.length,
    `Preview/PDF text line count diverged: ${JSON.stringify({
      preview: domPage.lines.length,
      pdf: pdfContentLines.length,
      pdfLines: pdfContentLines.map((line) => line.text),
    })}`);

  for (const [lineIndex, domLine] of domPage.lines.entries()) {
    const expectedText = normalizedText(domLine.text);
    const pdfLine = pdfContentLines[lineIndex];
    assert(pdfLine.text === expectedText,
      `Preview/PDF line text diverged at line ${lineIndex + 1}: ${JSON.stringify({
        preview: expectedText,
        pdf: pdfLine.text,
      })}`);
    assert(domLine.words.length === pdfLine.words.length,
      `Preview/PDF word count diverged on line ${JSON.stringify(expectedText)}: `
        + `${domLine.words.length} versus ${pdfLine.words.length}.`);
    for (let index = 0; index < domLine.words.length; index += 1) {
      assert(normalizedText(domLine.words[index].text) === pdfLine.words[index].text,
        `Preview/PDF word text diverged: ${JSON.stringify({
          line: expectedText,
          preview: domLine.words[index].text,
          pdf: pdfLine.words[index].text,
        })}`);
      pairs.push({ dom: domLine.words[index], pdf: pdfLine.words[index] });
    }
  }

  assert(pairs.length >= 40,
    `Too few words were compared between preview and PDF: ${pairs.length}.`);
  const xOffsets = pairs.map(({ dom, pdf }) => pdf.xMin - dom.xMin * xScale);
  const yOffsets = pairs.map(({ dom, pdf }) => pdf.yMin - dom.yMin * yScale);
  const xOffset = median(xOffsets);
  const yOffset = median(yOffsets);
  const xResiduals = xOffsets.map((value) => Math.abs(value - xOffset));
  const yResiduals = yOffsets.map((value) => Math.abs(value - yOffset));
  const widthDifferences = pairs.map(({ dom, pdf }) => Math.abs(
    (pdf.xMax - pdf.xMin) - (dom.xMax - dom.xMin) * xScale,
  ));
  const maximumXResidual = Math.max(...xResiduals);
  const maximumYResidual = Math.max(...yResiduals);
  const maximumWidthDifference = Math.max(...widthDifferences);
  const meanXResidual = xResiduals.reduce((sum, value) => sum + value, 0) / xResiduals.length;
  const meanYResidual = yResiduals.reduce((sum, value) => sum + value, 0) / yResiduals.length;
  const meanWidthDifference = widthDifferences.reduce((sum, value) => sum + value, 0)
    / widthDifferences.length;

  // A origem e as caixas de palavras vêm de dois modos de renderização do
  // Chromium, mas são normalizadas pelo MediaBox real. O deslocamento mediano
  // acomoda apenas a diferença sistemática de ink box/baseline; os resíduos
  // continuam apertados para detectar reflow ou posicionamento divergente.
  assert(Math.abs(xOffset) <= 1.25,
    `Preview/PDF horizontal origin diverged by ${xOffset.toFixed(4)} pt.`);
  assert(Math.abs(yOffset) <= 2.5,
    `Preview/PDF vertical ink origin diverged: ${JSON.stringify({
      offsetPt: yOffset,
      firstPair: pairs[0],
      firstDomLine: domPage.lines[0],
      firstPdfLine: pdfContentLines[0],
      previewScroll: domPage.scrollState,
      previewFirstLineInlineTop: domPage.firstLineInlineTop,
    })}`);
  assert(maximumXResidual <= 0.9 && meanXResidual <= 0.16,
    `Preview/PDF horizontal word geometry diverged: ${JSON.stringify({ maximumXResidual, meanXResidual })}`);
  assert(maximumYResidual <= 0.5 && meanYResidual <= 0.25,
    `Preview/PDF vertical word geometry diverged: ${JSON.stringify({ maximumYResidual, meanYResidual })}`);
  assert(maximumWidthDifference <= 1.35 && meanWidthDifference <= 0.22,
    `Preview/PDF word widths diverged: ${JSON.stringify({ maximumWidthDifference, meanWidthDifference })}`);

  return {
    comparedLines: domPage.lines.length,
    comparedWords: pairs.length,
    pdfTextLines: pdfPage.lines.length,
    pageSizePt: { width: pdfPage.width, height: pdfPage.height },
    scalePtPerCssPixel: { x: xScale, y: yScale },
    medianOffsetPt: { x: xOffset, y: yOffset },
    maximumResidualPt: { x: maximumXResidual, y: maximumYResidual },
    meanResidualPt: { x: meanXResidual, y: meanYResidual },
    wordWidthDifferencePt: { maximum: maximumWidthDifference, mean: meanWidthDifference },
  };
}

function inspectLoadedPdfChunk(webContents) {
  return webContents.executeJavaScript(`(() => {
    const root = document.querySelector('.pdf-export-root');
    const first = root?.querySelector('.pdf-export-page');
    if (!root || !first) return null;
    const rect = first.getBoundingClientRect();
    const articles = [...root.querySelectorAll('.pdf-export-page')];
    const runStyle = (marker) => {
      const run = [...root.querySelectorAll('span[data-story-from]')]
        .find((candidate) => candidate.textContent.includes(marker));
      if (!run) return null;
      const style = getComputedStyle(run);
      return {
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        textDecorationLine: style.textDecorationLine,
        color: style.color,
        fontSize: style.fontSize,
      };
    };
    return {
      pages: articles.length,
      physicalPages: articles.map((page) => Number(page.dataset.physicalPage)),
      folios: articles.map((page) => page.querySelector('.editorial-folio')?.textContent ?? null),
      paragraphStyles: [...new Set([...root.querySelectorAll('[data-paragraph-style]')]
        .map((line) => line.dataset.paragraphStyle))],
      rich: {
        bold: runStyle('NEGRITO'),
        italic: runStyle('ITÁLICO'),
        underline: runStyle('SUBLINHADO'),
        colored: runStyle('COLORIDO GRANDE'),
      },
      uiArtifacts: root.querySelectorAll(
        'button, input, .workspace-toolbar, .margin-guide, .bleed-guide, .precision-overlay, .resize-handle, .selected'
      ).length,
      width: rect.width,
      height: rect.height,
      images: [...root.querySelectorAll('.pdf-static-image')].map((image) => ({
        physicalPage: Number(image.closest('.pdf-export-page').dataset.physicalPage),
        fileName: image.dataset.fileName,
        left: image.style.left,
        top: image.style.top,
        width: image.style.width,
        height: image.style.height,
        zIndex: Number(image.style.zIndex),
      })),
      lines: root.querySelectorAll('.composed-text-line').length,
    };
  })()`);
}

function aggregateChunkSurfaces(chunkSurfaces, request) {
  assert(chunkSurfaces.length === request.htmlChunks.length,
    `Dedicated PDF renderer inspected ${chunkSurfaces.length} chunk(s), expected ${request.htmlChunks.length}.`);
  for (const [index, chunk] of chunkSurfaces.entries()) {
    assert(chunk.pages === request.chunkPageCounts[index],
      `PDF chunk ${index + 1} surface page count differs from the validated request.`);
    assert(chunk.uiArtifacts === 0, `PDF chunk ${index + 1} contains editor UI.`);
    assert(chunk.lines > 0, `PDF chunk ${index + 1} contains no composed text lines.`);
  }
  const first = chunkSurfaces[0];
  assert(chunkSurfaces.every((chunk) => closeTo(chunk.width, first.width, 0.05)
    && closeTo(chunk.height, first.height, 0.05)),
  "Dedicated PDF chunks do not share the same physical surface geometry.");
  const richKeys = ["bold", "italic", "underline", "colored"];
  return {
    pages: chunkSurfaces.reduce((sum, chunk) => sum + chunk.pages, 0),
    physicalPages: chunkSurfaces.flatMap((chunk) => chunk.physicalPages),
    folios: chunkSurfaces.flatMap((chunk) => chunk.folios),
    paragraphStyles: [...new Set(chunkSurfaces.flatMap((chunk) => chunk.paragraphStyles))],
    rich: Object.fromEntries(richKeys.map((key) => [
      key,
      chunkSurfaces.map((chunk) => chunk.rich[key]).find(Boolean) ?? null,
    ])),
    uiArtifacts: chunkSurfaces.reduce((sum, chunk) => sum + chunk.uiArtifacts, 0),
    width: first.width,
    height: first.height,
    images: chunkSurfaces.flatMap((chunk) => chunk.images),
    lines: chunkSurfaces.reduce((sum, chunk) => sum + chunk.lines, 0),
    chunkPageCounts: request.chunkPageCounts,
    assetCount: request.assets.length,
  };
}

app.whenReady().then(async () => {
  await fs.mkdir(outputDirectory, { recursive: true });
  const {
    renderPdfChunksAndWriteFile,
    validatePdfExportRequest,
  } = require(path.join(root, "dist-electron", "pdfExport.js"));
  const { countPdfPages } = require(path.join(root, "dist-electron", "pdfFiles.js"));

  ipcMain.handle("pdf:export", async (_event, rawRequest) => {
    assert(Array.isArray(rawRequest?.assets), "PDF export request did not include its asset registry.");
    assert(Array.isArray(rawRequest?.htmlChunks)
      && rawRequest.htmlChunks.every((chunk) => typeof chunk === "string" && !/data:image\//i.test(chunk)),
    "Serialized PDF HTML still contains an embedded data:image URL.");
    const request = validatePdfExportRequest(rawRequest);
    const currentExportIndex = exportIndex;
    const filePath = outputPaths[currentExportIndex];
    exportIndex += 1;
    if (!filePath) throw new Error("Unexpected extra PDF export in smoke test.");
    console.log(`[pdf-smoke] export ${currentExportIndex + 1}/${outputPaths.length}: ${JSON.stringify({
      file: path.basename(filePath),
      pages: request.expectedPageCount,
      chunkPageCounts: request.chunkPageCounts,
      assetCount: request.assets.length,
      widthMm: request.widthMm,
      heightMm: request.heightMm,
    })}`);
    const printStartedAt = performance.now();
    let renderWindow;
    const chunkSurfaces = [];
    const result = await renderPdfChunksAndWriteFile(
      () => {
        assert(!renderWindow, "A PDF export created more than one dedicated render window.");
        const browserWindow = new BrowserWindow({
          width: 1024,
          height: 768,
          show: false,
          backgroundColor: "#ffffff",
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            backgroundThrottling: false,
          },
        });
        browserWindow.webContents.on("render-process-gone", (_event, details) => {
          console.error(`[pdf-smoke] dedicated renderer exited: ${JSON.stringify(details)}`);
        });
        renderWindow = {
          webContents: browserWindow.webContents,
          loadURL: async (url) => {
            await browserWindow.loadURL(url);
            const chunkIndex = chunkSurfaces.length;
            const chunkSurface = await inspectLoadedPdfChunk(browserWindow.webContents);
            assert(chunkSurface, `Dedicated PDF chunk ${chunkIndex + 1} was not mounted.`);
            assert(chunkSurface.pages === request.chunkPageCounts[chunkIndex],
              `Dedicated PDF chunk ${chunkIndex + 1} page count differs from request.`);
            assert(chunkSurface.uiArtifacts === 0,
              `Dedicated PDF chunk ${chunkIndex + 1} contains editor UI.`);
            assert(chunkSurface.lines > 0,
              `Dedicated PDF chunk ${chunkIndex + 1} contains no composed text lines.`);
            chunkSurfaces.push(chunkSurface);
          },
          destroy: () => browserWindow.destroy(),
          isDestroyed: () => browserWindow.isDestroyed(),
        };
        return renderWindow;
      },
      filePath,
      request,
    );
    assert(renderWindow?.isDestroyed(), "The dedicated PDF render window was not destroyed.");
    const surface = aggregateChunkSurfaces(chunkSurfaces, request);
    assert(surface.pages === request.expectedPageCount, "PDF surface page count differs from request.");
    assert(surface.uiArtifacts === 0, "Editorial PDF surface contains editor UI.");
    assert(surface.lines > 0, "PDF surface contains no composed text lines.");
    exportSurfaces.push(surface);
    console.log(`[pdf-smoke] export ${currentExportIndex + 1} completed in ${Math.round(performance.now() - printStartedAt)} ms.`);
    return { canceled: false, filePath, ...result, surface };
  });

  const window = new BrowserWindow({
    width: 1600,
    height: 1200,
    show: true,
    backgroundColor: "#17201d",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // The smoke preload is loaded directly from dist-electron rather than
      // through the packaged application entry point. Other Electron smoke
      // harnesses use the same setting; production remains sandboxed.
      sandbox: false,
      backgroundThrottling: false,
      preload: path.join(root, "dist-electron", "preload.js"),
    },
  });
  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) console.error(`[renderer:${level}] ${message}`);
  });
  await window.loadFile(path.join(root, "dist", "index.html"));
  await new Promise((resolve) => setTimeout(resolve, 350));

  const png = createFixtureNativeImage(1, true);
  const jpeg = createFixtureNativeImage(2, false);
  const webpDataUrl = await window.webContents.executeJavaScript(`(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 72;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 96, 72);
    gradient.addColorStop(0, 'rgba(30, 120, 210, 0.35)');
    gradient.addColorStop(1, 'rgba(240, 135, 35, 1)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 96, 72);
    return canvas.toDataURL('image/webp', 0.92);
  })()`);
  assert(webpDataUrl.startsWith("data:image/webp;base64,"), "Chromium did not encode the WebP fixture.");
  rasterFixtures = [
    {
      fileName: "transparent-bleed.png",
      mimeType: "image/png",
      data: png.toPNG().toString("base64"),
    },
    {
      fileName: "fractional-geometry.jpg",
      mimeType: "image/jpeg",
      data: jpeg.toJPEG(92).toString("base64"),
    },
    {
      fileName: "transparent-overlap.webp",
      mimeType: "image/webp",
      data: webpDataUrl.slice(webpDataUrl.indexOf(",") + 1),
    },
  ];

  const rendererResult = await window.webContents.executeJavaScript(`(async () => { try {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    const button = (label) => [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent.trim() === label);
    const setInput = async (input, value, delay = 70) => {
      inputSetter.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(delay);
    };
    const setSelect = async (select, value, delay = 100) => {
      selectSetter.call(select, value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(delay);
    };
    const state = () => ({
      dirty: Boolean(document.querySelector('.saved-indicator.dirty')),
      zoom: document.querySelector('input[aria-label="Zoom"]').value,
      view: document.querySelector('.view-button.active').textContent.trim(),
      activePage: Number(document.querySelector('.active-page')?.dataset.pageIndex),
    });
    const editor = document.querySelector('.story-editor');
    button('Importar manuscrito').click();
    await wait(1100);

    const viewportRect = document.querySelector('.canvas-viewport').getBoundingClientRect();
    const importedFirstPageRect = document.querySelector('[data-page-index="0"]').getBoundingClientRect();
    const importCenterDelta = Math.abs(
      (importedFirstPageRect.left + importedFirstPageRect.width / 2)
      - (viewportRect.left + viewportRect.width / 2)
    );
    const importViewport = {
      scrollLeft: document.querySelector('.canvas-viewport').scrollLeft,
      scrollWidth: document.querySelector('.canvas-viewport').scrollWidth,
      clientWidth: document.querySelector('.canvas-viewport').clientWidth,
      viewportLeft: viewportRect.left,
      viewportWidth: viewportRect.width,
      pageLeft: importedFirstPageRect.left,
      pageWidth: importedFirstPageRect.width,
    };
    if (importedFirstPageRect.right <= viewportRect.left || importedFirstPageRect.left >= viewportRect.right) {
      throw new Error('Imported physical page 1 is outside the visible workspace.');
    }

    const applyStyleToMarker = async (marker, styleId) => {
      const run = [...document.querySelectorAll('span[data-story-from]')]
        .find((candidate) => candidate.textContent.includes(marker));
      if (!run) throw new Error('Marker not found: ' + marker);
      const node = run.firstChild;
      window.getSelection().setBaseAndExtent(node, 0, node, node.textContent.length);
      editor.focus();
      document.dispatchEvent(new Event('selectionchange'));
      await wait(30);
      await setSelect(document.querySelector('select[aria-label="Estilo de parágrafo"]'), styleId, 250);
    };
    await applyStyleToMarker('CITAÇÃO DE REFERÊNCIA', 'quote');
    await applyStyleToMarker('DEDICATÓRIA DE REFERÊNCIA', 'dedication');

    await setInput(document.querySelector('input[aria-label="Página física inicial da contagem"]'), 1);
    await setInput(document.querySelector('input[aria-label="Número lógico inicial"]'), 1);
    await setInput(document.querySelector('input[aria-label="Número lógico inicial de exibição"]'), 1);
    await setSelect(document.querySelector('select[aria-label="Formato da numeração"]'), 'roman-lower');
    await setSelect(document.querySelector('select[aria-label="Posição vertical da numeração"]'), 'bottom');
    await setSelect(document.querySelector('select[aria-label="Posição horizontal da numeração"]'), 'outer');
    await setInput(document.querySelector('input[aria-label="Números lógicos ocultos"]'), '2, 5', 180);

    const activatePage = async (pageIndex) => {
      const page = document.querySelector('[data-page-index="' + pageIndex + '"]');
      if (!page) throw new Error('Physical page is not mounted: ' + (pageIndex + 1));
      page.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 77 }));
      await wait(80);
    };
    const insertImage = async (pageIndex, geometry) => {
      await activatePage(pageIndex);
      button('Inserir imagem').click();
      await wait(240);
      const panel = document.querySelector('.object-properties');
      if (!panel) throw new Error('Image properties were not opened.');
      const aspect = panel.querySelector('input[type="checkbox"]');
      if (aspect.checked) aspect.click();
      await setInput(panel.querySelector('input[aria-label="X em milímetros"]'), geometry.x);
      await setInput(panel.querySelector('input[aria-label="Y em milímetros"]'), geometry.y);
      await setInput(panel.querySelector('input[aria-label="Largura em milímetros"]'), geometry.width);
      await setInput(panel.querySelector('input[aria-label="Altura em milímetros"]'), geometry.height, 140);
    };
    await insertImage(1, { x: -3, y: 70, width: 25, height: 25 });
    await insertImage(2, { x: 12.5, y: 92.25, width: 63.4, height: 41.8 });
    await insertImage(2, { x: 24.5, y: 101.75, width: 43.25, height: 30.5 });

    const zoom = document.querySelector('input[aria-label="Zoom"]');
    await setInput(zoom, 50, 180);
    const before = {
      ...state(),
      pageCount: document.querySelectorAll('.trim-page').length,
      storyLength: [...document.querySelectorAll('span[data-story-from]')]
        .reduce((sum, node) => sum + node.textContent.replace(/\u200b/g, '').length, 0),
      lineGeometry: [...document.querySelectorAll('.page-shell')].map((page) => {
        const trimElement = page.querySelector('.trim-page');
        const textLayer = page.querySelector('.editorial-text-layer');
        const marginGuideElement = page.querySelector('.margin-guide');
        const trim = trimElement.getBoundingClientRect();
        const marginGuide = marginGuideElement?.getBoundingClientRect();
        const allLines = [...page.querySelectorAll('.composed-text-line')].map((line) => {
          const rect = line.getBoundingClientRect();
          const computedLineHeight = Number.parseFloat(getComputedStyle(line).lineHeight);
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            boxHeight: rect.height,
            computedLineHeight,
            lineHeightMatchesBox: Number.isFinite(computedLineHeight)
              && Math.abs(computedLineHeight - rect.height) <= 0.1,
            text: line.textContent.trim(),
          };
        });
        const lines = allLines.filter((line) => line.text);
        return {
          physicalIndex: Number(page.dataset.pageIndex),
          trimScroll: {
            left: trimElement.scrollLeft,
            top: trimElement.scrollTop,
          },
          textLayerScroll: {
            left: textLayer?.scrollLeft ?? 0,
            top: textLayer?.scrollTop ?? 0,
          },
          trimTop: trim.top,
          trimBottom: trim.bottom,
          marginGuide: marginGuide ? {
            left: marginGuide.left,
            right: marginGuide.right,
            top: marginGuide.top,
            bottom: marginGuide.bottom,
          } : null,
          firstTop: lines[0]?.top,
          lastBottom: lines.at(-1)?.bottom,
          monotonic: lines.every((line, index) => !index || line.top >= lines[index - 1].top - 0.25),
          lineHeightsMatchBoxes: allLines.every((line) => line.lineHeightMatchesBox),
          lineHeightMismatches: allLines.filter((line) => !line.lineHeightMatchesBox).slice(0, 3),
          withinMargins: !marginGuide || lines.every((line) =>
            line.left >= marginGuide.left - 0.75
              && line.right <= marginGuide.right + 0.75
              && line.top >= marginGuide.top - 0.75
              && line.bottom <= marginGuide.bottom + 0.75),
        };
      }),
    };
    if (before.pageCount < 30) throw new Error('Fixture did not compose at least 30 physical pages.');

    const runExport = async ({ bleed = false, range } = {}) => {
      const stateBefore = state();
      button('Exportar PDF').click();
      await wait(80);
      const dialog = document.querySelector('.pdf-dialog');
      if (!dialog) throw new Error('PDF dialog did not open.');
      if (bleed) dialog.querySelector('.pdf-checkbox-option input').click();
      if (range) {
        const field = dialog.querySelector('input[aria-label="Intervalo de páginas físicas"]');
        field.closest('label').querySelector('input[type="radio"]').click();
        await setInput(field, range, 30);
      }
      [...dialog.querySelectorAll('button')]
        .find((candidate) => candidate.textContent.includes('Escolher destino')).click();
      const deadline = Date.now() + 60000;
      while (document.querySelector('.pdf-dialog') && Date.now() < deadline) {
        const error = document.querySelector('.pdf-error');
        if (error) throw new Error(error.textContent);
        await wait(100);
      }
      if (document.querySelector('.pdf-dialog')) throw new Error('PDF export timed out.');
      const stateAfter = state();
      if (JSON.stringify(stateBefore) !== JSON.stringify(stateAfter)) {
        throw new Error('PDF export changed renderer state: ' + JSON.stringify({ stateBefore, stateAfter }));
      }
      return { stateBefore, stateAfter };
    };

    const exports = [];
    exports.push(await runExport());
    await setInput(zoom, 200, 180);
    button('Página única').click();
    await wait(180);
    exports.push(await runExport());
    exports.push(await runExport({ bleed: true }));
    exports.push(await runExport({ range: '15-30' }));

    button('Spread').click();
    await wait(120);
    await activatePage(before.pageCount - 1);
    const lastRun = [...document.querySelectorAll('span[data-story-from]')].at(-1);
    const lastNode = lastRun.firstChild;
    window.getSelection().setBaseAndExtent(lastNode, lastNode.textContent.length, lastNode, lastNode.textContent.length);
    editor.focus();
    const continuation = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(continuation, 'clipboardData', { value: { getData: () => ' CONTINUA-APOS-PDF' } });
    editor.dispatchEvent(continuation);
    await wait(220);
    const continued = document.body.innerText.includes('CONTINUA-APOS-PDF');

    button('Página única').click();
    await wait(100);
    await setInput(document.querySelector('input[aria-label="Ir para página física"]'), 3, 30);
    button('Ir').click();
    await setInput(zoom, 75, 180);
    const visualPage = document.querySelector('[data-page-index="2"]');
    if (!visualPage) throw new Error('Physical page 3 is not mounted for comparison.');
    visualPage.scrollIntoView({ block: 'center', inline: 'center' });
    await wait(180);
    await Promise.all([...visualPage.querySelectorAll('img')].map((image) => image.decode()));
    const visualStyle = document.createElement('style');
    visualStyle.textContent = '.visual-pdf-compare .margin-guide, .visual-pdf-compare .bleed-guide, '
      + '.visual-pdf-compare .precision-overlay, .visual-pdf-compare .resize-handle { display:none !important; } '
      + '.visual-pdf-compare .trim-page, .visual-pdf-compare .positioned-object, '
      + '.visual-pdf-compare .active-page { outline:none !important; box-shadow:none !important; }';
    document.head.appendChild(visualStyle);
    document.body.classList.add('visual-pdf-compare');
    await wait(120);
    const trimElement = visualPage.querySelector('.trim-page');
    const visualRect = trimElement.getBoundingClientRect();
    // Isolate word measurement from the live editing host and its active caret.
    const geometryHost = document.createElement('div');
    geometryHost.setAttribute('aria-hidden', 'true');
    Object.assign(geometryHost.style, {
      position: 'fixed',
      left: '8px',
      top: '8px',
      width: visualRect.width + 'px',
      height: visualRect.height + 'px',
      zIndex: '2147483647',
      pointerEvents: 'none',
      overflow: 'hidden',
      background: '#fffefa',
    });
    const geometryTrim = trimElement.cloneNode(true);
    geometryTrim.removeAttribute('contenteditable');
    geometryTrim.querySelectorAll('[contenteditable]').forEach((element) => {
      element.removeAttribute('contenteditable');
    });
    Object.assign(geometryTrim.style, {
      position: 'relative',
      left: '0px',
      top: '0px',
      outline: 'none',
      boxShadow: 'none',
    });
    geometryHost.appendChild(geometryTrim);
    document.body.appendChild(geometryHost);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const geometryRect = geometryTrim.getBoundingClientRect();
    if (Math.abs(geometryRect.width - visualRect.width) > 0.05
      || Math.abs(geometryRect.height - visualRect.height) > 0.05) {
      throw new Error('Geometry clone lost the preview page dimensions.');
    }
    const wordBoxes = (line) => {
      const nodes = [];
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) nodes.push(walker.currentNode);
      const source = nodes.map((node) => node.data).join('');
      const locate = (offset, endPoint) => {
        let traversed = 0;
        for (let index = 0; index < nodes.length; index += 1) {
          const node = nodes[index];
          const next = traversed + node.data.length;
          if (offset < next || (endPoint && offset === next) || index === nodes.length - 1) {
            return { node, offset: Math.max(0, Math.min(node.data.length, offset - traversed)) };
          }
          traversed = next;
        }
        return null;
      };
      const words = [];
      for (const match of source.matchAll(/[^\\s\\u200b]+/gu)) {
        const start = locate(match.index, false);
        const end = locate(match.index + match[0].length, true);
        if (!start || !end) continue;
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        const box = range.getBoundingClientRect();
        words.push({
          text: match[0],
          xMin: box.left - geometryRect.left,
          yMin: box.top - geometryRect.top,
          xMax: box.right - geometryRect.left,
          yMax: box.bottom - geometryRect.top,
        });
      }
      return words;
    };
    const domTextGeometry = {
      physicalPage: 3,
      trimWidth: visualRect.width,
      trimHeight: visualRect.height,
      folio: geometryTrim.querySelector('.editorial-folio')?.textContent.trim() ?? null,
      scrollState: {
        trimTop: trimElement.scrollTop,
        trimLeft: trimElement.scrollLeft,
        layerTop: visualPage.querySelector('.editorial-text-layer').scrollTop,
        layerLeft: visualPage.querySelector('.editorial-text-layer').scrollLeft,
      },
      firstLineInlineTop: geometryTrim.querySelector('.composed-text-line')?.style.top ?? null,
      lines: [...geometryTrim.querySelectorAll('.composed-text-line')]
        .map((line) => {
          const words = wordBoxes(line);
          const box = line.getBoundingClientRect();
          return {
            text: words.map((word) => word.text).join(' '),
            xMin: box.left - geometryRect.left,
            yMin: box.top - geometryRect.top,
            xMax: box.right - geometryRect.left,
            yMax: box.bottom - geometryRect.top,
            words,
          };
        })
        .filter((line) => line.words.length),
    };
    geometryHost.remove();

    return {
      before,
      exports,
      importCenterDelta,
      importViewport,
      continued,
      exportRootPresent: Boolean(document.querySelector('.pdf-export-root')),
      domTextGeometry,
      visualCapture: {
        x: Math.floor(visualRect.left),
        y: Math.floor(visualRect.top),
        width: Math.ceil(visualRect.width),
        height: Math.ceil(visualRect.height),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        physicalPage: 3,
      },
    };
    } catch (error) {
      return { __error: String(error?.stack ?? error) };
    }
  })()`);

  assert(!rendererResult.__error, `Renderer fixture failed: ${rendererResult.__error}`);
  assert(exportIndex === 4, "Not all expected PDF exports reached the main process.");
  assert(rendererResult.before.dirty, "Imported unsaved manuscript is not dirty.");
  assert(rendererResult.importCenterDelta < 25,
    `Imported page 1 was not centered in the workspace: ${JSON.stringify({
      delta: rendererResult.importCenterDelta,
      viewport: rendererResult.importViewport,
    })}`);
  assert(rendererResult.before.lineGeometry.every((page) => page.monotonic),
    "Imported manuscript produced non-monotonic line positions.");
  assert(rendererResult.before.lineGeometry.every((page) => page.lineHeightsMatchBoxes),
    `An imported line's computed line-height differs from its box height by more than 0.1px: ${JSON.stringify(
      rendererResult.before.lineGeometry
        .filter((page) => !page.lineHeightsMatchBoxes)
        .map((page) => ({ physicalIndex: page.physicalIndex, lines: page.lineHeightMismatches }))
        .slice(0, 3),
    )}`);
  assert(rendererResult.before.lineGeometry.every((page) => page.firstTop === undefined
    || (page.firstTop >= page.trimTop - 0.75 && page.lastBottom <= page.trimBottom + 0.75)),
    `Imported manuscript escaped the trim: ${JSON.stringify(rendererResult.before.lineGeometry
      .filter((page) => page.firstTop !== undefined
        && (page.firstTop < page.trimTop - 0.75 || page.lastBottom > page.trimBottom + 0.75)).slice(0, 3))}`);
  assert(rendererResult.before.lineGeometry.every((page) => page.withinMargins),
    `Imported manuscript escaped its margin guide: ${JSON.stringify(rendererResult.before.lineGeometry
      .filter((page) => !page.withinMargins).slice(0, 3))}`);
  assert(rendererResult.before.lineGeometry.every((page) =>
    page.trimScroll.top === 0 && page.trimScroll.left === 0
      && page.textLayerScroll.top === 0 && page.textLayerScroll.left === 0),
  `An internal editorial layer was auto-scrolled: ${JSON.stringify(rendererResult.before.lineGeometry
    .filter((page) => page.trimScroll.top !== 0 || page.trimScroll.left !== 0
      || page.textLayerScroll.top !== 0 || page.textLayerScroll.left !== 0).slice(0, 3))}`);
  assert(!rendererResult.exportRootPresent, "Transient PDF surface was not unmounted.");
  assert(rendererResult.continued, "Editing did not continue after PDF export.");

  const fullSurface = exportSurfaces[0];
  assert(fullSurface.physicalPages.every((page, index) => page === index + 1),
    "All-pages export changed physical page order.");
  assert(["body", "chapter-title", "subtitle", "quote", "dedication"]
    .every((styleId) => fullSurface.paragraphStyles.includes(styleId)),
  `PDF fixture is missing paragraph styles: ${JSON.stringify(fullSurface.paragraphStyles)}`);
  assert(Number(fullSurface.rich.bold.fontWeight) >= 600, "Bold run was not preserved.");
  assert(fullSurface.rich.italic.fontStyle === "italic", "Italic run was not preserved.");
  assert(fullSurface.rich.underline.textDecorationLine.includes("underline"),
    "Underline run was not preserved.");
  assert(fullSurface.rich.colored.color === "rgb(164, 59, 50)"
    && Number.parseFloat(fullSurface.rich.colored.fontSize) > 17,
  `Colored/large run was not preserved: ${JSON.stringify(fullSurface.rich.colored)}`);
  assert(fullSurface.folios[0] === "i" && fullSurface.folios[1] === null
    && fullSurface.folios[2] === "iii" && fullSurface.folios[4] === null,
  `Roman folio visibility/exception is wrong: ${JSON.stringify(fullSurface.folios.slice(0, 6))}`);
  const noBleedPng = fullSurface.images.find((image) => image.fileName === "transparent-bleed.png");
  const fractionalJpeg = fullSurface.images.find((image) => image.fileName === "fractional-geometry.jpg");
  const overlapWebp = fullSurface.images.find((image) => image.fileName === "transparent-overlap.webp");
  assert(noBleedPng?.physicalPage === 2 && noBleedPng.left === "-3mm"
    && noBleedPng.top === "70mm" && noBleedPng.width === "25mm" && noBleedPng.height === "25mm",
  `Negative bleed image geometry is wrong: ${JSON.stringify(noBleedPng)}`);
  assert(fractionalJpeg?.physicalPage === 3 && fractionalJpeg.left === "12.5mm"
    && fractionalJpeg.top === "92.25mm" && fractionalJpeg.width === "63.4mm"
    && fractionalJpeg.height === "41.8mm",
  `Fractional JPEG geometry is wrong: ${JSON.stringify(fractionalJpeg)}`);
  assert(overlapWebp?.physicalPage === 3 && overlapWebp.zIndex > fractionalJpeg.zIndex,
    "Overlapping WebP did not remain above the JPEG.");
  const bleedPng = exportSurfaces[2].images.find((image) => image.fileName === "transparent-bleed.png");
  assert(bleedPng?.left === "0mm", `Bleed offset was not added to X=-3mm: ${JSON.stringify(bleedPng)}`);
  const rangeSurface = exportSurfaces[3];
  assert(rangeSurface.physicalPages.length === 16
    && rangeSurface.physicalPages[0] === 15
    && rangeSurface.physicalPages.at(-1) === 30,
  `Physical range identity/order is wrong: ${JSON.stringify(rangeSurface.physicalPages)}`);
  assert(rangeSurface.folios[0] === "xv" && rangeSurface.folios.at(-1) === "xxx",
    `Physical range folios are wrong: ${JSON.stringify([rangeSurface.folios[0], rangeSurface.folios.at(-1)])}`);

  const buffers = await Promise.all(outputPaths.map((filePath) => fs.readFile(filePath)));
  const counts = buffers.map(countPdfPages);
  assert(counts[0] === rendererResult.before.pageCount, "All-pages PDF has the wrong count.");
  assert(counts[1] === rendererResult.before.pageCount, "Single-page/200% PDF has the wrong count.");
  assert(counts[2] === rendererResult.before.pageCount, "Bleed PDF has the wrong count.");
  assert(counts[3] === 16, "Range 15-30 did not generate exactly sixteen pages.");
  const boxes = buffers.map(firstMediaBox);
  const ptPerMm = 72 / 25.4;
  assert(closeTo(boxes[0].width, 148 * ptPerMm) && closeTo(boxes[0].height, 210 * ptPerMm),
    `A5 trim MediaBox is wrong: ${JSON.stringify(boxes[0])}`);
  assert(closeTo(boxes[1].width, boxes[0].width) && closeTo(boxes[1].height, boxes[0].height),
    `Zoom/view mode changed PDF geometry: ${JSON.stringify([boxes[0], boxes[1]])}`);
  assert(closeTo(boxes[2].width, 154 * ptPerMm) && closeTo(boxes[2].height, 216 * ptPerMm),
    `A5 bleed MediaBox is wrong: ${JSON.stringify(boxes[2])}`);
  assert(closeTo(boxes[3].width, 148 * ptPerMm) && closeTo(boxes[3].height, 210 * ptPerMm),
    `Range MediaBox is wrong: ${JSON.stringify(boxes[3])}`);
  for (const [index, buffer] of buffers.entries()) {
    const source = buffer.toString("latin1");
    assert(buffer.byteLength > 10000, `PDF ${index + 1} is unexpectedly small.`);
    assert(/\/Font\b/.test(source), `PDF ${index + 1} contains no font resources.`);
    assert(/\/Subtype\s*\/Image\b/.test(source) || index === 3,
      `PDF ${index + 1} contains no raster image resource.`);
    if (index !== 3) assert(/\/SMask\b/.test(source), `PDF ${index + 1} lost image transparency.`);
  }

  window.showInactive();
  await new Promise((resolve) => setTimeout(resolve, 350));
  window.webContents.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const liveCapture = await window.webContents.executeJavaScript(`(() => {
    const page = document.querySelector('[data-page-index="2"]');
    const trim = page?.querySelector('.trim-page');
    const rect = trim?.getBoundingClientRect();
    const line = page?.querySelector('.composed-text-line')?.getBoundingClientRect();
    const lineDiagnostics = [...(page?.querySelectorAll('.composed-text-line') ?? [])]
      .slice(0, 14).map((element) => {
        const box = element.getBoundingClientRect();
        return { top: box.top, text: element.textContent.replace(/\u200b/g, '').trim().slice(0, 36) };
      });
    return {
      dialogOpen: Boolean(document.querySelector('.pdf-dialog')),
      ...(rect ? {
        x: Math.floor(rect.left), y: Math.floor(rect.top),
        width: Math.ceil(rect.width), height: Math.ceil(rect.height),
      } : {}),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      devicePixelRatio: window.devicePixelRatio,
      trim: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      firstLine: line ? { x: line.x, y: line.y, width: line.width, height: line.height } : null,
      lineDiagnostics,
    };
  })()`);
  assert(!liveCapture.dialogOpen, "PDF dialog remained mounted after successful export.");
  assert(liveCapture.width > 0 && liveCapture.height > 0, "Visual comparison page is not mounted.");

  const previewScreenshotPath = path.join(outputDirectory, "imported-manuscript-preview.png");
  const previewScreenshot = await window.webContents.capturePage();
  await fs.writeFile(previewScreenshotPath, previewScreenshot.toPNG());
  const previewPagePath = path.join(outputDirectory, "preview-page-3.png");
  const screenshotSize = previewScreenshot.getSize();
  const capture = liveCapture;
  const scaleX = screenshotSize.width / capture.viewportWidth;
  const scaleY = screenshotSize.height / capture.viewportHeight;
  const cropRect = {
    x: Math.max(0, Math.round(capture.x * scaleX)),
    y: Math.max(0, Math.round(capture.y * scaleY)),
    width: Math.min(screenshotSize.width, Math.round(capture.width * scaleX)),
    height: Math.min(screenshotSize.height, Math.round(capture.height * scaleY)),
  };
  cropRect.width = Math.min(cropRect.width, screenshotSize.width - cropRect.x);
  cropRect.height = Math.min(cropRect.height, screenshotSize.height - cropRect.y);
  let previewPage = previewScreenshot.crop(cropRect);
  const directPreviewPage = await window.webContents.capturePage({
    x: liveCapture.x,
    y: liveCapture.y,
    width: liveCapture.width,
    height: liveCapture.height,
  });
  if (!directPreviewPage.isEmpty()) previewPage = directPreviewPage;
  await fs.writeFile(previewPagePath, previewPage.toPNG());

  const configuredPopplerBin = process.env.POPPLER_BIN;
  const popplerSearchRoot = path.join(root, ".tools", "poppler-26.02.0-0");
  const pdftoppmPath = configuredPopplerBin
    ? path.join(configuredPopplerBin, "pdftoppm.exe")
    : await findExecutable(popplerSearchRoot, "pdftoppm.exe");
  const pdftotextPath = configuredPopplerBin
    ? path.join(configuredPopplerBin, "pdftotext.exe")
    : await findExecutable(popplerSearchRoot, "pdftotext.exe");
  assert(pdftoppmPath && pdftotextPath,
    "Poppler local is required for reproducible PDF smoke geometry/text verification.");
  const popplerBin = path.dirname(pdftotextPath);
    const pdfPagePrefix = path.join(outputDirectory, "pdf-page-3");
    const pdfPagePath = `${pdfPagePrefix}.png`;
    const diffPagePath = path.join(outputDirectory, "diff-page-3.png");
    const noBleedPageTwoPrefix = path.join(outputDirectory, "no-bleed-page-2");
    const bleedPageTwoPrefix = path.join(outputDirectory, "bleed-page-2");
    const extractedTextPath = path.join(outputDirectory, "a5-no-bleed.txt");
    const rangeTextPath = path.join(outputDirectory, "physical-pages-15-30.txt");
    const bboxLayoutPath = path.join(outputDirectory, "a5-no-bleed-page-3-bbox.html");
    const previewSize = previewPage.getSize();
    const comparisonDpi = Math.max(72, Math.round(previewSize.width * 25.4 / 148));
    await execFileAsync(pdftoppmPath, [
      "-f", "3", "-l", "3", "-singlefile", "-png", "-r", String(comparisonDpi),
      outputPaths[0], pdfPagePrefix,
    ]);
    await execFileAsync(pdftoppmPath, [
      "-f", "2", "-l", "2", "-singlefile", "-png", "-r", String(comparisonDpi),
      outputPaths[0], noBleedPageTwoPrefix,
    ]);
    await execFileAsync(pdftoppmPath, [
      "-f", "2", "-l", "2", "-singlefile", "-png", "-r", String(comparisonDpi),
      outputPaths[2], bleedPageTwoPrefix,
    ]);
    await execFileAsync(pdftotextPath, [
      "-layout", outputPaths[0], extractedTextPath,
    ]);
    await execFileAsync(pdftotextPath, [
      "-layout", outputPaths[3], rangeTextPath,
    ]);
    await execFileAsync(pdftotextPath, [
      "-f", "3", "-l", "3", "-bbox-layout", outputPaths[0], bboxLayoutPath,
    ]);
    const [{ stdout: fonts }, { stdout: images }, extractedText, rangeText, bboxLayout] = await Promise.all([
      execFileAsync(path.join(popplerBin, "pdffonts.exe"), [outputPaths[0]], { maxBuffer: 5_000_000 }),
      execFileAsync(path.join(popplerBin, "pdfimages.exe"), ["-list", outputPaths[0]], { maxBuffer: 5_000_000 }),
      fs.readFile(extractedTextPath, "utf8"),
      fs.readFile(rangeTextPath, "utf8"),
      fs.readFile(bboxLayoutPath, "utf8"),
    ]);
    assert(extractedText.includes("TÍTULO DE REFERÊNCIA")
      && extractedText.includes("NEGRITO")
      && extractedText.includes("MARCADOR APÓS QUEBRA MANUAL"),
    "Selectable PDF text is missing rich/manual-break fixture content.");
    for (const forbidden of ["Exportar PDF", "Página física", "Ajustar spread", "GUIAS"]) {
      assert(!extractedText.includes(forbidden), `Editor UI leaked into extracted PDF text: ${forbidden}`);
    }
    const extractedRangePages = rangeText.split("\f").filter((page) => page.trim());
    assert(extractedRangePages.length === 16
      && /(^|\s)xv(\s|$)/u.test(extractedRangePages[0])
      && /(^|\s)xxx(\s|$)/u.test(extractedRangePages.at(-1)),
    "Extracted range text does not identify physical pages 15 through 30 in order.");
    const fontLines = fonts.split(/\r?\n/).filter((line) => line.includes("Georgia"));
    assert(fontLines.length > 0 && fontLines.every((line) => /\byes\s+yes\s+yes\b/.test(line)),
    `A PDF font was not embedded/subset/unicode-mapped:\n${fonts}`);
    assert(/\bsmask\b/.test(images), "Poppler did not find an image transparency mask.");

    const pdfTextGeometry = parseBboxLayout(bboxLayout);
    const geometryComparison = compareDomAndPdfGeometry(
      rendererResult.domTextGeometry,
      pdfTextGeometry,
    );

    const renderedPage = nativeImage.createFromPath(pdfPagePath);
    assert(!renderedPage.isEmpty(), "Poppler did not render PDF page 3.");
    const comparisonWidth = Math.round(148 / 25.4 * comparisonDpi);
    const comparisonHeight = Math.round(210 / 25.4 * comparisonDpi);
    const comparison = compareRasterImages(
      previewPage,
      renderedPage,
      comparisonWidth,
      comparisonHeight,
    );
    await fs.writeFile(diffPagePath, comparison.diffImage.toPNG());
    // Capturas do Electron podem variar conforme compositor/GPU. Mantemos os
    // PNGs e o diff para inspeção, mas a aprovação vem das linhas/palavras e
    // caixas bbox-layout verificadas acima, não deste diagnóstico raster.
    const pixelDiagnostic = {
      meanAbsoluteError: Number(comparison.meanAbsoluteError.toFixed(4)),
      changedPixelRatio: Number(comparison.changedPixelRatio.toFixed(6)),
      withinPreviousThreshold: comparison.meanAbsoluteError < 12
        && comparison.changedPixelRatio < 0.18,
      liveCapture,
      screenshotSize,
      cropRect,
      previewSize,
      previewContentBounds: rasterContentBounds(previewPage),
      pdfContentBounds: rasterContentBounds(renderedPage),
    };
    const independentVerification = {
      available: true,
      authoritativeCheck: "pdftotext-bbox-layout",
      popplerBin,
      selectableText: true,
      containsZeroWidthSpace: extractedText.includes("\u200b"),
      fontLines,
      imageMask: true,
      bboxLayoutPath,
      geometryComparison,
      comparisonDpi,
      previewPagePath,
      pdfPagePath,
      diffPagePath,
      noBleedPageTwoPath: `${noBleedPageTwoPrefix}.png`,
      bleedPageTwoPath: `${bleedPageTwoPrefix}.png`,
      pixelDiagnostic,
    };

  const geometryViolations = rendererResult.before.lineGeometry.filter((page) =>
    !page.monotonic
      || !page.lineHeightsMatchBoxes
      || !page.withinMargins
      || page.trimScroll.top !== 0
      || page.trimScroll.left !== 0
      || page.textLayerScroll.top !== 0
      || page.textLayerScroll.left !== 0
      || (page.firstTop !== undefined
        && (page.firstTop < page.trimTop - 0.75 || page.lastBottom > page.trimBottom + 0.75)));
  console.log(JSON.stringify({
    outputPaths,
    previewScreenshotPath,
    previewPagePath,
    pageCounts: counts,
    mediaBoxesPt: boxes,
    byteLengths: buffers.map((buffer) => buffer.byteLength),
    independentVerification,
    renderer: {
      importedPageCount: rendererResult.before.pageCount,
      checkedGeometryPages: rendererResult.before.lineGeometry.length,
      geometryViolations,
      dirtyBefore: rendererResult.before.dirty,
      zoomBefore: rendererResult.before.zoom,
      viewBefore: rendererResult.before.view,
      exportStates: rendererResult.exports,
      importCenterDeltaPx: rendererResult.importCenterDelta,
      visualCapture: rendererResult.visualCapture,
      exportRootPresentAfter: rendererResult.exportRootPresent,
      editingContinued: rendererResult.continued,
      paragraphStyles: fullSurface.paragraphStyles,
      rich: fullSurface.rich,
      folios: fullSurface.folios.slice(0, 6),
      images: fullSurface.images,
      pdfChunkPageCounts: exportSurfaces.map((surface) => surface.chunkPageCounts),
      pdfAssetCounts: exportSurfaces.map((surface) => surface.assetCount),
      htmlChunksContainEmbeddedDataImages: false,
    },
  }, null, 2));
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
