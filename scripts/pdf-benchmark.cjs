"use strict";

const { performance } = require("node:perf_hooks");
const fs = require("node:fs/promises");
const path = require("node:path");
const { app, BrowserWindow, ipcMain, nativeImage } = require("electron");

const root = path.resolve(__dirname, "..");
const rendererEntry = path.join(root, "dist", "index.html");
const preloadEntry = path.join(root, "dist-electron", "preload.js");
const pdfExportEntry = path.join(root, "dist-electron", "pdfExport.js");
const pdfFilesEntry = path.join(root, "dist-electron", "pdfFiles.js");
const outputDir = path.join(root, ".tmp", "pdf-benchmark");
const outputPath = path.join(outputDir, "livro-studio-100-pages.pdf");
const userDataPath = path.join(outputDir, `electron-user-data-${process.pid}`);

const EXPECTED_MIN_PAGES = 100;
const EXPECTED_MAX_PAGES = 105;
const EXPECTED_IMAGES = 40;
const MIN_CHARACTERS = 145_000;
const MAX_CHARACTERS = 180_000;
const MIN_PDF_BYTES = 100_000;
const EXPORT_UI_TIMEOUT_MS = 420_000;

let fixtureMetadata = null;
let rasterFixtures = [];
let nextRasterFixture = 0;
let exportReport = null;
let exportCalls = 0;
let windowRef = null;

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("in-process-gpu");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.setPath("userData", userDataPath);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildFixture(paragraphCount) {
  const htmlBlocks = [];
  const plainBlocks = [];
  let manualPageBreaks = 0;

  function addBlock(html, plainText) {
    htmlBlocks.push(html);
    plainBlocks.push(plainText);
  }

  addBlock(`<h1>BENCHMARK PDF ${paragraphCount}</h1>`, `BENCHMARK PDF ${paragraphCount}`);
  addBlock(
    "<p>CITAÇÃO-BENCHMARK — trecho destinado ao estilo de citação editorial.</p>",
    "CITAÇÃO-BENCHMARK — trecho destinado ao estilo de citação editorial.",
  );
  addBlock(
    "<p>DEDICATÓRIA-BENCHMARK — registro destinado ao estilo de dedicatória.</p>",
    "DEDICATÓRIA-BENCHMARK — registro destinado ao estilo de dedicatória.",
  );
  addBlock(
    "<p>Teste rico com <strong>NEGRITO-BENCHMARK</strong>, <em>ITÁLICO-BENCHMARK</em>, "
      + "<u>SUBLINHADO-BENCHMARK</u> e "
      + "<span style=\"color: #2764b4; font-size: 13pt\">COR-BENCHMARK</span>.</p>",
    "Teste rico com NEGRITO-BENCHMARK, ITÁLICO-BENCHMARK, SUBLINHADO-BENCHMARK e COR-BENCHMARK.",
  );

  const continuation =
    "Este trecho deliberadamente extenso exercita acentuação, pontuação, composição justificada, "
    + "hifenização, recuos editoriais e continuidade entre páginas sem depender de conteúdo externo. ";

  for (let index = 1; index <= paragraphCount; index += 1) {
    if (index % 60 === 0) {
      const title = `Capítulo ${Math.ceil(index / 60)} — Uma mudança de ritmo`;
      addBlock(`<h1>${escapeHtml(title)}</h1>`, title);
    } else if (index % 20 === 0) {
      const subtitle = `Seção ${Math.ceil(index / 20)} — Observações de composição`;
      addBlock(`<h2>${escapeHtml(subtitle)}</h2>`, subtitle);
    } else {
      const prefix =
        `Parágrafo ${index}. Texto editorial com vocabulário variado, números ${index * 17}, `
        + "travessões —, aspas “tipográficas” e palavras suficientes para produzir linhas realistas. ";
      const plainText = `${prefix}negrito, itálico, sublinhado e cor editorial. ${continuation}`;
      const richLead = index % 7 === 0
        ? "<strong>negrito</strong>, <em>itálico</em>, <u>sublinhado</u> e "
          + "<span style=\"color: #6d2f8a\">cor editorial</span>. "
        : "negrito, itálico, sublinhado e cor editorial. ";
      addBlock(`<p>${escapeHtml(prefix)}${richLead}${escapeHtml(continuation)}</p>`, plainText);
    }

    if (index % 20 === 0) {
      htmlBlocks.push('<br data-page-break="true">');
      manualPageBreaks += 1;
    }
  }

  const plainText = plainBlocks.join("\n");
  return {
    html: "<!doctype html><html><head><meta charset=\"utf-8\"></head><body>"
      + htmlBlocks.join("\n")
      + "</body></html>",
    metadata: {
      requestedParagraphs: paragraphCount,
      contentBlocks: plainBlocks.length,
      manualPageBreaks,
      sourceCharacters: plainText.length,
      chapterTitles: htmlBlocks.filter((block) => block.startsWith("<h1>")).length,
      subtitles: htmlBlocks.filter((block) => block.startsWith("<h2>")).length,
    },
  };
}

function createFixtureNativeImage(seed, transparent) {
  const width = 96;
  const height = 72;
  const bitmap = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      bitmap[offset] = (x * 3 + seed * 29) % 256;
      bitmap[offset + 1] = (y * 4 + seed * 47) % 256;
      bitmap[offset + 2] = ((x + y) * 2 + seed * 61) % 256;
      bitmap[offset + 3] = transparent && (x + y + seed) % 9 === 0 ? 96 : 255;
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width, height });
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  assert(match, "Data URL raster inválida.");
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}

function assertRasterSignature(fixture) {
  const buffer = Buffer.from(fixture.bytesBase64, "base64");
  if (fixture.mimeType === "image/png") {
    assert(buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")), "PNG inválido.");
    return;
  }
  if (fixture.mimeType === "image/jpeg") {
    assert(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff, "JPEG inválido.");
    return;
  }
  if (fixture.mimeType === "image/webp") {
    assert(buffer.subarray(0, 4).toString("ascii") === "RIFF", "WebP sem RIFF.");
    assert(buffer.subarray(8, 12).toString("ascii") === "WEBP", "WebP sem assinatura WEBP.");
    return;
  }
  throw new Error(`Formato raster inesperado: ${fixture.mimeType}`);
}

async function createRasterFixtures(window) {
  const webpDataUrls = await window.webContents.executeJavaScript(`
    (() => Array.from({ length: 13 }, (_, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 72;
      const context = canvas.getContext("2d");
      const gradient = context.createLinearGradient(0, 0, 96, 72);
      gradient.addColorStop(0, "hsl(" + ((index * 31) % 360) + " 75% 46%)");
      gradient.addColorStop(1, "hsl(" + ((index * 31 + 120) % 360) + " 70% 68%)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 96, 72);
      context.fillStyle = "rgba(255,255,255,0.82)";
      context.font = "bold 18px sans-serif";
      context.fillText("W" + (index + 1), 31, 42);
      return canvas.toDataURL("image/webp", 0.9);
    }))()
  `);

  const fixtures = [];
  let webpIndex = 0;
  for (let index = 0; index < EXPECTED_IMAGES; index += 1) {
    if (index % 3 === 0) {
      fixtures.push({
        bytesBase64: createFixtureNativeImage(index + 1, true).toPNG().toString("base64"),
        fileName: `benchmark-${String(index + 1).padStart(2, "0")}.png`,
        mimeType: "image/png",
      });
    } else if (index % 3 === 1) {
      fixtures.push({
        bytesBase64: createFixtureNativeImage(index + 1, false).toJPEG(90).toString("base64"),
        fileName: `benchmark-${String(index + 1).padStart(2, "0")}.jpg`,
        mimeType: "image/jpeg",
      });
    } else {
      const decoded = decodeDataUrl(webpDataUrls[webpIndex]);
      webpIndex += 1;
      assert(decoded.mimeType === "image/webp", "O Chromium não codificou o fixture como WebP.");
      fixtures.push({
        bytesBase64: decoded.buffer.toString("base64"),
        fileName: `benchmark-${String(index + 1).padStart(2, "0")}.webp`,
        mimeType: "image/webp",
      });
    }
  }
  fixtures.forEach(assertRasterSignature);
  return fixtures;
}

function countMarkupClass(html, className) {
  const classAttribute = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let count = 0;
  for (let match = classAttribute.exec(html); match; match = classAttribute.exec(html)) {
    const classes = (match[1] ?? match[2] ?? "").trim().split(/\s+/);
    if (classes.includes(className)) count += 1;
  }
  return count;
}

function workingSetKb() {
  return app
    .getAppMetrics()
    .reduce((total, metric) => total + (metric.memory?.workingSetSize ?? 0), 0);
}

function registerIpcHandlers(renderPdfChunksAndWriteFile) {
  ipcMain.handle("manuscript:confirm-replace", async () => true);
  ipcMain.handle("document:confirm-unsaved", async () => "discard");
  ipcMain.handle("document:open", async () => ({ canceled: true }));
  ipcMain.handle("document:save", async () => ({
    canceled: false,
    filePath: path.join(outputDir, "benchmark-state.json"),
  }));
  ipcMain.handle("app:open-external", async () => true);
  ipcMain.on("document:set-dirty", () => undefined);
  ipcMain.on("document:finish-close", () => undefined);

  ipcMain.handle("manuscript:import", async (event) => {
    const url = new URL(event.sender.getURL());
    const requested = Number.parseInt(url.searchParams.get("benchmarkParagraphs") ?? "420", 10);
    assert(Number.isInteger(requested) && requested >= 200 && requested <= 650, "Contagem solicitada inválida.");
    const fixture = buildFixture(requested);
    fixtureMetadata = fixture.metadata;
    return {
      canceled: false,
      manuscript: {
        filePath: `benchmark-${requested}.docx`,
        fileName: `benchmark-${requested}.docx`,
        format: "docx",
        text: "",
        html: fixture.html,
        warnings: [],
      },
    };
  });

  ipcMain.handle("asset:pick-image", async () => {
    const fixture = rasterFixtures[nextRasterFixture];
    assert(fixture, `A interface solicitou uma 41ª imagem (índice ${nextRasterFixture}).`);
    nextRasterFixture += 1;
    return {
      canceled: false,
      image: {
        fileName: fixture.fileName,
        mimeType: fixture.mimeType,
        data: fixture.bytesBase64,
      },
    };
  });

  ipcMain.handle("pdf:export", async (_event, request) => {
    exportCalls += 1;
    assert(exportCalls === 1, "O benchmark disparou mais de uma exportação PDF.");
    assert(fixtureMetadata, "O fixture textual não foi importado antes da exportação.");
    assert(nextRasterFixture === EXPECTED_IMAGES, "Nem todas as imagens foram inseridas antes da exportação.");
    assert(
      fixtureMetadata.sourceCharacters >= MIN_CHARACTERS
        && fixtureMetadata.sourceCharacters <= MAX_CHARACTERS,
      `O fixture contém ${fixtureMetadata.sourceCharacters} caracteres; a faixa aceita é 145–180 mil.`,
    );
    assert(typeof request?.cssText === "string" && request.cssText.length > 0, "O App não enviou CSS ao IPC.");
    assert(Array.isArray(request?.htmlChunks) && request.htmlChunks.length > 0, "O App não enviou lotes HTML.");

    assert(Array.isArray(request.assets) && request.assets.length === EXPECTED_IMAGES,
      "O App deve enviar exatamente 40 assets de imagem desduplicados.");
    const chunkPageCounts = request.htmlChunks.map((chunk) => countMarkupClass(chunk, "pdf-export-page"));
    const serializedHtml = request.htmlChunks.join("");
    const serializedPages = chunkPageCounts.reduce((total, count) => total + count, 0);
    const serializedImages = countMarkupClass(serializedHtml, "pdf-static-image");
    assert(chunkPageCounts.every((count) => count >= 1 && count <= 20), "O App produziu um lote fora de 1–20 páginas.");
    assert(serializedPages === request.expectedPageCount, "A soma dos lotes divergiu do pedido PDF.");
    assert(serializedImages === EXPECTED_IMAGES, `Os lotes contêm ${serializedImages} imagens; eram esperadas 40.`);
    assert(!serializedHtml.includes("selection-outline"), "Os lotes contêm contorno de seleção.");
    assert(!serializedHtml.includes("contenteditable=\"true\""), "Os lotes contêm um editor ativo.");
    assert(!serializedHtml.includes("data:image/"), "Os lotes HTML ainda duplicam imagens base64.");
    for (const marker of [
      "CITAÇÃO-BENCHMARK",
      "DEDICATÓRIA-BENCHMARK",
      "NEGRITO-BENCHMARK",
      "ITÁLICO-BENCHMARK",
      "SUBLINHADO-BENCHMARK",
      "COR-BENCHMARK",
    ]) {
      assert(serializedHtml.includes(marker), `O marcador rico ${marker} não chegou aos lotes PDF.`);
    }
    for (const styleId of ["chapter-title", "subtitle", "quote", "dedication"]) {
      assert(
        serializedHtml.includes(`data-paragraph-style=\"${styleId}\"`),
        `O estilo editorial ${styleId} não chegou aos lotes PDF.`,
      );
    }

    const memoryBeforeKb = workingSetKb();
    const wallStartedAt = performance.now();
    let dedicatedWindowsCreated = 0;
    const result = await renderPdfChunksAndWriteFile(
      () => {
        dedicatedWindowsCreated += 1;
        return new BrowserWindow({
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
      },
      outputPath,
      request,
    );
    const wallDurationMs = performance.now() - wallStartedAt;
    const memoryAfterKb = workingSetKb();
    assert(dedicatedWindowsCreated === 1, "A exportação não usou exatamente uma janela dedicada.");

    exportReport = {
      ...result,
      wallDurationMs,
      memoryBeforeKb,
      memoryAfterKb,
      memoryDeltaKb: memoryAfterKb - memoryBeforeKb,
      dedicatedWindowsCreated,
      request: {
        title: request.title,
        widthMm: request.widthMm,
        heightMm: request.heightMm,
        expectedPageCount: request.expectedPageCount,
      },
      serialized: {
        cssBytes: Buffer.byteLength(request.cssText, "utf8"),
        htmlBytes: request.htmlChunks.reduce(
          (total, chunk) => total + Buffer.byteLength(chunk, "utf8"),
          0,
        ),
        chunkCount: request.htmlChunks.length,
        chunkPageCounts,
        pages: serializedPages,
        images: serializedImages,
        assets: request.assets.length,
        assetBytes: request.assets.reduce(
          (total, asset) => total + Buffer.from(asset.data, "base64").byteLength,
          0,
        ),
      },
    };
    return { canceled: false, filePath: outputPath, ...result };
  });
}

async function runRendererBenchmark(window) {
  return window.webContents.executeJavaScript(`
    (async () => {
      const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const fail = (message) => { throw new Error(message); };
      const assert = (condition, message) => { if (!condition) fail(message); };
      const button = (label) => Array.from(document.querySelectorAll("button"))
        .find((candidate) => candidate.textContent.trim() === label);
      const waitFor = async (predicate, message, timeout = 30000) => {
        const deadline = performance.now() + timeout;
        while (performance.now() < deadline) {
          const value = predicate();
          if (value) return value;
          await sleep(50);
        }
        fail(message);
      };
      const setInput = (input, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(input, String(value));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const setSelect = (select, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
        setter.call(select, value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const pageCount = () => document.querySelectorAll(".trim-page").length;
      const imageCount = () => document.querySelectorAll(".positioned-object").length;

      await waitFor(() => button("Importar manuscrito"), "A aplicação não abriu.");

      async function importFixture(requested) {
        history.replaceState(null, "", "?benchmarkParagraphs=" + requested);
        button("Importar manuscrito").click();
        await waitFor(
          () => document.body.innerText.includes("BENCHMARK PDF " + requested),
          "A importação " + requested + " não apareceu no editor.",
          60000,
        );
        let previous = -1;
        let stableSamples = 0;
        const deadline = performance.now() + 60000;
        while (performance.now() < deadline) {
          const current = pageCount();
          if (current > 0 && current === previous) stableSamples += 1;
          else stableSamples = 0;
          if (stableSamples >= 5) return current;
          previous = current;
          await sleep(100);
        }
        fail("A paginação não estabilizou para " + requested + " parágrafos.");
      }

      let low = 250;
      let high = 600;
      let requested = 420;
      let composedPages = 0;
      const calibration = [];
      for (let attempt = 0; attempt < 11; attempt += 1) {
        composedPages = await importFixture(requested);
        calibration.push({ requestedParagraphs: requested, pages: composedPages });
        if (composedPages >= ${EXPECTED_MIN_PAGES} && composedPages <= ${EXPECTED_MAX_PAGES}) break;
        if (composedPages < ${EXPECTED_MIN_PAGES}) low = requested + 1;
        else high = requested - 1;
        assert(low <= high, "A busca de tamanho esgotou o intervalo calibrável.");
        requested = Math.floor((low + high) / 2);
      }
      assert(
        composedPages >= ${EXPECTED_MIN_PAGES} && composedPages <= ${EXPECTED_MAX_PAGES},
        "O compositor estabilizou fora da meta: " + composedPages + " páginas.",
      );

      const applyStyleToMarker = async (marker, styleId) => {
        const node = Array.from(document.querySelectorAll(".composed-text-line span"))
          .find((candidate) => (candidate.textContent || "").includes(marker));
        assert(node, "Marcador editorial ausente: " + marker);
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        const editor = node.closest("[contenteditable='true']");
        assert(editor, "Editor do marcador não encontrado.");
        editor.focus();
        document.dispatchEvent(new Event("selectionchange"));
        const styleSelect = document.querySelector("select[aria-label='Estilo de parágrafo']");
        assert(styleSelect, "Seletor de estilos ausente.");
        setSelect(styleSelect, styleId);
        await sleep(150);
      };

      await applyStyleToMarker("CITAÇÃO-BENCHMARK", "quote");
      await applyStyleToMarker("DEDICATÓRIA-BENCHMARK", "dedication");
      composedPages = pageCount();
      assert(
        composedPages >= ${EXPECTED_MIN_PAGES} && composedPages <= ${EXPECTED_MAX_PAGES},
        "Os estilos editoriais deslocaram a paginação para " + composedPages + " páginas.",
      );

      const activatePage = (index) => {
        const page = document.querySelector("[data-page-index='" + index + "']");
        assert(page, "Página não encontrada para ativação: " + index);
        page.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          pointerId: 77,
          clientX: 24,
          clientY: 24,
        }));
      };

      for (let index = 0; index < ${EXPECTED_IMAGES}; index += 1) {
        const targetPage = (Math.floor(index / 2) * 13) % composedPages;
        activatePage(targetPage);
        const before = imageCount();
        const insertButton = button("Inserir imagem");
        assert(insertButton && !insertButton.disabled, "Inserção de imagem indisponível no índice " + index);
        insertButton.click();
        await waitFor(
          () => imageCount() === before + 1,
          "A imagem " + (index + 1) + " não foi inserida.",
          15000,
        );
        if (index % 10 === 0) {
          const xInput = await waitFor(
            () => document.querySelector(".object-properties input[aria-label='X em milímetros']"),
            "O painel geométrico da imagem não abriu.",
          );
          setInput(xInput, -3);
          await sleep(80);
        }
      }
      assert(imageCount() === ${EXPECTED_IMAGES}, "A prévia não contém exatamente 40 imagens.");
      assert(pageCount() === composedPages, "Inserir objetos alterou a paginação textual.");

      const stateSnapshot = () => {
        const zoom = document.querySelector("input[aria-label='Zoom']");
        const selectedObject = document.querySelector(".positioned-object.selected");
        const activePage = document.querySelector(".trim-page.active-page");
        const storyCharacters = Array.from(document.querySelectorAll(".composed-text-line span"))
          .reduce((total, span) => total + (span.textContent || "").replaceAll("\\u200b", "").length, 0);
        return {
          dirty: Boolean(document.querySelector(".saved-indicator.dirty")),
          zoom: zoom ? Number(zoom.value) : null,
          view: button("Página única")?.classList.contains("active") ? "single" : "spread",
          activePage: activePage ? Number(activePage.getAttribute("data-page-index")) : null,
          selectedObject: selectedObject?.getAttribute("data-object-id") || null,
          previewPageCount: pageCount(),
          previewImageCount: imageCount(),
          storyCharacters,
        };
      };

      const statePage = Math.min(42, composedPages - 1);
      activatePage(statePage);
      const singleButton = button("Página única");
      assert(singleButton, "Controle de página única ausente.");
      singleButton.click();
      const zoomInput = document.querySelector("input[aria-label='Zoom']");
      assert(zoomInput, "Controle de zoom ausente.");
      setInput(zoomInput, 125);
      await sleep(150);
      const beforeExport = stateSnapshot();
      assert(beforeExport.view === "single", "O benchmark não entrou em página única.");
      assert(beforeExport.zoom === 125, "O zoom de teste não foi aplicado.");
      assert(beforeExport.dirty, "O documento deveria estar marcado como alterado.");

      const exportButton = button("Exportar PDF");
      assert(exportButton, "Comando de exportação ausente.");
      exportButton.click();
      const dialog = await waitFor(
        () => document.querySelector("[role='dialog']"),
        "O diálogo de exportação não abriu.",
      );
      const allPages = dialog.querySelector("input[type='radio'][name='pdf-page-selection']");
      assert(allPages?.checked, "A opção de todas as páginas não iniciou selecionada.");
      const bleed = dialog.querySelector("input[type='checkbox']");
      assert(bleed, "Opção de sangria ausente.");
      if (!bleed.checked) bleed.click();
      const confirm = Array.from(dialog.querySelectorAll("button"))
        .find((candidate) => candidate.textContent.trim() === "Escolher destino e exportar");
      assert(confirm, "Confirmação de exportação ausente.");
      confirm.click();

      await waitFor(
        () => !document.querySelector("[role='dialog']") || document.querySelector(".pdf-error"),
        "A exportação PDF excedeu sete minutos.",
        ${EXPORT_UI_TIMEOUT_MS},
      );
      const exportError = document.querySelector(".pdf-error");
      assert(!exportError, "A interface reportou: " + exportError?.textContent);
      await sleep(150);
      const afterExport = stateSnapshot();
      assert(
        JSON.stringify(afterExport) === JSON.stringify(beforeExport),
        "O estado mudou durante a exportação: " + JSON.stringify({ beforeExport, afterExport }),
      );
      assert(!document.querySelector(".pdf-export-root"), "A superfície PDF não foi desmontada.");
      assert(document.querySelector(".story-editor[contenteditable='true']"), "O editor não ficou disponível.");

      return {
        calibration,
        requestedParagraphs: requested,
        pages: composedPages,
        beforeExport,
        afterExport,
        statePreserved: true,
        editorStillAvailable: true,
      };
    })()
  `);
}

async function run() {
  await fs.access(rendererEntry);
  await fs.access(preloadEntry);
  await fs.access(pdfExportEntry);
  await fs.access(pdfFilesEntry);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.rm(outputPath, { force: true });

  const { renderPdfChunksAndWriteFile } = require(pdfExportEntry);
  const { countPdfPages } = require(pdfFilesEntry);
  registerIpcHandlers(renderPdfChunksAndWriteFile);

  windowRef = new BrowserWindow({
    width: 1600,
    height: 1200,
    show: true,
    backgroundColor: "#17201d",
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: preloadEntry,
    },
  });

  await windowRef.loadFile(rendererEntry);
  await new Promise((resolve) => setTimeout(resolve, 350));
  rasterFixtures = await createRasterFixtures(windowRef);
  const formatCounts = rasterFixtures.reduce((counts, fixture) => {
    counts[fixture.mimeType] = (counts[fixture.mimeType] ?? 0) + 1;
    return counts;
  }, {});
  const rendererReport = await runRendererBenchmark(windowRef);

  assert(exportReport, "O processo principal não registrou a exportação.");
  assert(exportCalls === 1, `Esperava uma exportação; recebeu ${exportCalls}.`);
  assert(fixtureMetadata.sourceCharacters >= MIN_CHARACTERS, "O fixture ficou abaixo de 145 mil caracteres.");
  assert(fixtureMetadata.sourceCharacters <= MAX_CHARACTERS, "O fixture excedeu 180 mil caracteres.");
  assert(exportReport.pageCount === rendererReport.pages, "A contagem do PDF divergiu da prévia.");
  assert(exportReport.byteLength >= MIN_PDF_BYTES, "O PDF ficou anormalmente pequeno.");

  const pdf = await fs.readFile(outputPath);
  assert(pdf.subarray(0, 5).toString("ascii") === "%PDF-", "O artefato não tem cabeçalho PDF.");
  assert(countPdfPages(pdf) === rendererReport.pages, "A releitura do PDF divergiu da contagem esperada.");
  const pdfImageObjects = (pdf.toString("latin1").match(/\/Subtype\s*\/Image\b/g) ?? []).length;
  assert(pdfImageObjects >= EXPECTED_IMAGES, `O PDF contém somente ${pdfImageObjects} objetos de imagem.`);

  const report = {
    status: "ok",
    scenario: {
      ...fixtureMetadata,
      composedPages: rendererReport.pages,
      images: EXPECTED_IMAGES,
      formatCounts,
      calibration: rendererReport.calibration,
    },
    export: {
      outputPath,
      durationMs: Number(exportReport.durationMs.toFixed(1)),
      wallDurationMs: Number(exportReport.wallDurationMs.toFixed(1)),
      byteLength: exportReport.byteLength,
      sizeMiB: Number((exportReport.byteLength / 1024 / 1024).toFixed(2)),
      pageCount: exportReport.pageCount,
      pdfImageObjects,
      widthMm: exportReport.request.widthMm,
      heightMm: exportReport.request.heightMm,
      includeBleed: true,
      dedicatedWindowsCreated: exportReport.dedicatedWindowsCreated,
      serialized: exportReport.serialized,
    },
    memory: {
      beforeWorkingSetMiB: Number((exportReport.memoryBeforeKb / 1024).toFixed(1)),
      afterWorkingSetMiB: Number((exportReport.memoryAfterKb / 1024).toFixed(1)),
      deltaWorkingSetMiB: Number((exportReport.memoryDeltaKb / 1024).toFixed(1)),
    },
    state: {
      preserved: rendererReport.statePreserved,
      before: rendererReport.beforeExport,
      after: rendererReport.afterExport,
      editorStillAvailable: rendererReport.editorStillAvailable,
    },
  };
  console.log(JSON.stringify(report, null, 2));
}

app.whenReady().then(async () => {
  try {
    await run();
    windowRef?.destroy();
    await fs.rm(userDataPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    app.exit(0);
  } catch (error) {
    console.error(error?.stack ?? error);
    windowRef?.destroy();
    app.exit(1);
  }
});
