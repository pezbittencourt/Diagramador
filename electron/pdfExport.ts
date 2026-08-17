import type { PrintToPDFOptions, WebContents } from "electron";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFDocument } from "pdf-lib";
import { detectImageMimeType, type SupportedImageMime } from "./imageFiles.js";
import { countPdfPages, writePdfFileAtomic } from "./pdfFiles.js";

const MAX_CSS_BYTES = 4 * 1024 * 1024;
const MAX_HTML_CHUNK_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_HTML_BYTES = 512 * 1024 * 1024;
const MAX_PAGES_PER_CHUNK = 25;
const MAX_PDF_ASSETS = 2_000;
const MAX_PDF_ASSET_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_PDF_ASSET_BYTES = 512 * 1024 * 1024;
const DEFAULT_CHUNK_TIMEOUT_MS = 60_000;
const PDF_APPLICATION_NAME = "Livro Studio 0.8.0";

export interface PdfRenderRequest {
  widthMm: number;
  heightMm: number;
  expectedPageCount: number;
}

export interface PdfExportRequest extends PdfRenderRequest {
  suggestedName: string;
  title: string;
  cssText: string;
  htmlChunks: string[];
  assets: PdfExportAsset[];
}

export interface PdfExportAsset {
  fileName: string;
  mimeType: SupportedImageMime;
  data: string;
}

export interface ValidatedPdfExportRequest extends PdfExportRequest {
  chunkPageCounts: number[];
  physicalPageNumbers: number[];
}

export interface PdfRenderResult {
  byteLength: number;
  pageCount: number;
  durationMs: number;
}

export interface PdfRenderWindow {
  webContents: Pick<WebContents, "executeJavaScript" | "printToPDF">;
  loadURL(url: string): Promise<void>;
  destroy(): void;
  isDestroyed(): boolean;
}

export type PdfRenderWindowFactory = () => PdfRenderWindow;

interface PdfChunkRenderOptions {
  chunkTimeoutMs?: number;
  removePrintDirectory?: (directory: string) => Promise<void>;
}

function physicalPrintOptions(request: PdfRenderRequest): PrintToPDFOptions {
  return {
    displayHeaderFooter: false,
    generateDocumentOutline: false,
    generateTaggedPDF: false,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    pageSize: {
      width: request.widthMm / 25.4,
      height: request.heightMm / 25.4,
    },
    preferCSSPageSize: true,
    printBackground: true,
    scale: 1,
  };
}

export function countPdfExportPagesInHtml(html: string): number {
  const classAttribute = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let count = 0;
  for (let match = classAttribute.exec(html); match; match = classAttribute.exec(html)) {
    const classes = (match[1] ?? match[2] ?? "").trim().split(/\s+/);
    if (classes.includes("pdf-export-page")) count += 1;
  }
  return count;
}

interface PdfPageIdentity {
  outputPage: number;
  physicalPage: number;
}

function htmlAttribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match?.[1] ?? match?.[2];
}

function pageIdentitiesInHtml(html: string): PdfPageIdentity[] {
  const identities: PdfPageIdentity[] = [];
  for (const match of html.matchAll(/<article\b[^>]*>/gi)) {
    const tag = match[0];
    const classes = (htmlAttribute(tag, "class") ?? "").trim().split(/\s+/);
    if (!classes.includes("pdf-export-page")) continue;
    const outputPage = Number(htmlAttribute(tag, "data-output-page"));
    const physicalPage = Number(htmlAttribute(tag, "data-physical-page"));
    if (!Number.isSafeInteger(outputPage) || outputPage < 1
        || !Number.isSafeInteger(physicalPage) || physicalPage < 1) {
      throw new Error("Uma p\u00e1gina do lote PDF n\u00e3o possui identidade f\u00edsica v\u00e1lida.");
    }
    identities.push({ outputPage, physicalPage });
  }
  return identities;
}

function imageSourcesInHtml(html: string): string[] {
  const sources: string[] = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const source = htmlAttribute(match[0], "src");
    if (!source) throw new Error("Uma imagem do lote PDF n\u00e3o possui origem.");
    sources.push(source);
  }
  return sources;
}

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const PDF_ASSET_NAME_PATTERN = /^asset-[1-9]\d*\.(png|jpg|webp)$/;
const EXTENSION_BY_MIME: Record<SupportedImageMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function validatePdfAssets(rawAssets: unknown): PdfExportAsset[] {
  if (!Array.isArray(rawAssets) || rawAssets.length > MAX_PDF_ASSETS) {
    throw new Error(`Os recursos de imagem do PDF devem conter no m\u00e1ximo ${MAX_PDF_ASSETS} itens.`);
  }
  const assets: PdfExportAsset[] = [];
  const names = new Set<string>();
  let totalBytes = 0;
  for (const [index, rawAsset] of rawAssets.entries()) {
    if (!rawAsset || typeof rawAsset !== "object") {
      throw new Error(`O recurso de imagem PDF ${index + 1} \u00e9 inv\u00e1lido.`);
    }
    const asset = rawAsset as Record<string, unknown>;
    if (typeof asset.fileName !== "string" || !PDF_ASSET_NAME_PATTERN.test(asset.fileName)
        || names.has(asset.fileName)) {
      throw new Error(`O nome do recurso de imagem PDF ${index + 1} \u00e9 inv\u00e1lido ou duplicado.`);
    }
    if (asset.mimeType !== "image/png"
        && asset.mimeType !== "image/jpeg"
        && asset.mimeType !== "image/webp") {
      throw new Error(`O tipo do recurso de imagem PDF ${index + 1} n\u00e3o \u00e9 suportado.`);
    }
    const expectedExtension = EXTENSION_BY_MIME[asset.mimeType];
    if (!asset.fileName.endsWith(`.${expectedExtension}`)) {
      throw new Error(`A extens\u00e3o do recurso de imagem PDF ${index + 1} n\u00e3o corresponde ao tipo.`);
    }
    if (typeof asset.data !== "string" || asset.data.length % 4 !== 0
        || !BASE64_PATTERN.test(asset.data)) {
      throw new Error(`Os dados do recurso de imagem PDF ${index + 1} n\u00e3o s\u00e3o base64 v\u00e1lido.`);
    }
    const buffer = Buffer.from(asset.data, "base64");
    if (buffer.byteLength > MAX_PDF_ASSET_BYTES) {
      throw new Error(`O recurso de imagem PDF ${index + 1} excede o limite de 50 MiB.`);
    }
    if (detectImageMimeType(buffer) !== asset.mimeType) {
      throw new Error(`O conte\u00fado do recurso de imagem PDF ${index + 1} n\u00e3o corresponde ao tipo declarado.`);
    }
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_TOTAL_PDF_ASSET_BYTES) {
      throw new Error("Os recursos de imagem do PDF excedem o limite total de 512 MiB.");
    }
    names.add(asset.fileName);
    assets.push({
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      data: asset.data,
    });
  }
  return assets;
}

function validMeasure(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 10 && value <= 2000;
}

function safeSuggestedPdfName(value: string): string {
  const baseName = path.basename(value.trim() || "livro-sem-titulo.pdf")
    .replace(/[\x00-\x1f<>:"/\\|?*]/g, "-")
    .slice(0, 240);
  const usableName = baseName && baseName !== "." && baseName !== ".."
    ? baseName
    : "livro-sem-titulo.pdf";
  return usableName.toLowerCase().endsWith(".pdf") ? usableName : `${usableName}.pdf`;
}

export function validatePdfExportRequest(rawRequest: unknown): ValidatedPdfExportRequest {
  if (!rawRequest || typeof rawRequest !== "object") {
    throw new Error("Pedido de exportação PDF inválido.");
  }
  const request = rawRequest as Record<string, unknown>;
  if (!validMeasure(request.widthMm) || !validMeasure(request.heightMm)) {
    throw new Error("O tamanho físico solicitado para o PDF é inválido.");
  }
  if (!Number.isInteger(request.expectedPageCount)
      || (request.expectedPageCount as number) < 1
      || (request.expectedPageCount as number) > 10_000) {
    throw new Error("A quantidade de páginas solicitada para o PDF é inválida.");
  }
  if (typeof request.suggestedName !== "string" || typeof request.title !== "string") {
    throw new Error("Os metadados do PDF são inválidos.");
  }
  if (typeof request.cssText !== "string" || !request.cssText.trim()) {
    throw new Error("O CSS da exportação PDF é inválido.");
  }
  if (Buffer.byteLength(request.cssText, "utf8") > MAX_CSS_BYTES) {
    throw new Error("O CSS da exportação PDF excede o limite de 4 MiB.");
  }
  if (!Array.isArray(request.htmlChunks) || request.htmlChunks.length === 0) {
    throw new Error("Os lotes HTML da exportação PDF são inválidos.");
  }

  const assets = validatePdfAssets(request.assets);
  const assetNames = new Set(assets.map((asset) => asset.fileName));
  const referencedAssets = new Set<string>();
  const chunkPageCounts: number[] = [];
  const htmlChunks: string[] = [];
  const physicalPageNumbers: number[] = [];
  let totalHtmlBytes = 0;
  let totalPages = 0;
  for (const [index, value] of request.htmlChunks.entries()) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`O lote HTML ${index + 1} é inválido.`);
    }
    const byteLength = Buffer.byteLength(value, "utf8");
    if (byteLength > MAX_HTML_CHUNK_BYTES) {
      throw new Error(`O lote HTML ${index + 1} excede o limite de 64 MiB.`);
    }
    totalHtmlBytes += byteLength;
    if (totalHtmlBytes > MAX_TOTAL_HTML_BYTES) {
      throw new Error("Os lotes HTML excedem o limite total de 512 MiB.");
    }
    const identities = pageIdentitiesInHtml(value);
    const pageCount = identities.length;
    if (countPdfExportPagesInHtml(value) !== pageCount) {
      throw new Error(`O lote HTML ${index + 1} possui marca\u00e7\u00e3o de p\u00e1gina amb\u00edgua.`);
    }
    if (pageCount < 1 || pageCount > MAX_PAGES_PER_CHUNK) {
      throw new Error(
        `O lote HTML ${index + 1} deve conter entre 1 e ${MAX_PAGES_PER_CHUNK} páginas PDF.`,
      );
    }
    for (const identity of identities) {
      const expectedOutputPage = physicalPageNumbers.length + 1;
      if (identity.outputPage !== expectedOutputPage) {
        throw new Error(
          `A ordem de sa\u00edda do PDF \u00e9 inv\u00e1lida: esperava a p\u00e1gina ${expectedOutputPage}, `
          + `mas recebeu ${identity.outputPage}.`,
        );
      }
      const previousPhysicalPage = physicalPageNumbers.at(-1);
      if (previousPhysicalPage !== undefined && identity.physicalPage <= previousPhysicalPage) {
        throw new Error("As p\u00e1ginas f\u00edsicas do PDF est\u00e3o duplicadas ou fora de ordem.");
      }
      physicalPageNumbers.push(identity.physicalPage);
    }
    for (const source of imageSourcesInHtml(value)) {
      const match = /^\.\/assets\/(asset-[1-9]\d*\.(?:png|jpg|webp))$/.exec(source);
      if (!match || !assetNames.has(match[1])) {
        throw new Error(`O lote HTML ${index + 1} referencia um recurso de imagem n\u00e3o autorizado.`);
      }
      referencedAssets.add(match[1]);
    }
    chunkPageCounts.push(pageCount);
    htmlChunks.push(value);
    totalPages += pageCount;
  }
  if (totalPages !== request.expectedPageCount) {
    throw new Error(
      `Os lotes HTML contêm ${totalPages} página(s), mas eram esperadas ${request.expectedPageCount}.`,
    );
  }
  if (referencedAssets.size !== assetNames.size) {
    throw new Error("A lista de recursos de imagem do PDF cont\u00e9m itens n\u00e3o utilizados.");
  }

  return {
    suggestedName: safeSuggestedPdfName(request.suggestedName),
    title: request.title.trim().slice(0, 300) || "Livro sem título",
    widthMm: request.widthMm,
    heightMm: request.heightMm,
    expectedPageCount: request.expectedPageCount as number,
    cssText: request.cssText,
    htmlChunks,
    assets,
    chunkPageCounts,
    physicalPageNumbers,
  };
}

function printableDocument(htmlChunk: string): string {
  return [
    "<!doctype html><html><head><meta charset=\"utf-8\">",
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src 'self'; "
      + "font-src data:; style-src 'self' 'unsafe-inline'\">",
    "<link rel=\"stylesheet\" href=\"./livro-studio.css\"></head>",
    `<body>${htmlChunk}</body></html>`,
  ].join("");
}

const WAIT_FOR_PRINT_RESOURCES = `
  (async () => {
    if (document.fonts) await document.fonts.ready;
    await Promise.all(Array.from(document.images, async (image) => {
      if (typeof image.decode === "function") {
        await image.decode();
        return;
      }
      if (image.complete && image.naturalWidth > 0) return;
      await new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", () => reject(new Error("Uma imagem do PDF não pôde ser carregada.")), { once: true });
      });
    }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
  })()
`;

async function withChunkTimeout<T>(
  operation: Promise<T>,
  window: PdfRenderWindow,
  chunkIndex: number,
  timeoutMs: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          if (!window.isDestroyed()) window.destroy();
          reject(new Error(
            `A geração do lote PDF ${chunkIndex + 1} excedeu ${Math.ceil(timeoutMs / 1000)} segundos.`,
          ));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function renderChunk(
  window: PdfRenderWindow,
  request: ValidatedPdfExportRequest,
  chunkIndex: number,
  documentUrl: string,
  timeoutMs: number,
): Promise<Buffer> {
  const operation = (async () => {
    await window.loadURL(documentUrl);
    await window.webContents.executeJavaScript(WAIT_FOR_PRINT_RESOURCES);
    const buffer = await window.webContents.printToPDF(physicalPrintOptions(request));
    const pageCount = countPdfPages(buffer);
    const expected = request.chunkPageCounts[chunkIndex];
    if (pageCount !== expected) {
      throw new Error(
        `O Chromium gerou ${pageCount} página(s) no lote ${chunkIndex + 1}, mas eram esperadas ${expected}.`,
      );
    }
    return buffer;
  })();
  return withChunkTimeout(operation, window, chunkIndex, timeoutMs);
}

async function appendPdfBuffer(merged: PDFDocument, buffer: Buffer): Promise<void> {
  const source = await PDFDocument.load(buffer);
  const pages = await merged.copyPages(source, source.getPageIndices());
  for (const page of pages) merged.addPage(page);
}

async function saveMergedPdf(merged: PDFDocument, title: string): Promise<Buffer> {
  merged.setTitle(title);
  merged.setCreator(PDF_APPLICATION_NAME);
  merged.setProducer(PDF_APPLICATION_NAME);
  return Buffer.from(await merged.save({ useObjectStreams: false }));
}

export async function mergePdfBuffers(buffers: readonly Buffer[], title: string): Promise<Buffer> {
  if (!buffers.length) throw new Error("Nenhum lote PDF foi produzido para mesclagem.");
  const merged = await PDFDocument.create({ updateMetadata: false });
  for (const buffer of buffers) await appendPdfBuffer(merged, buffer);
  return saveMergedPdf(merged, title);
}

export async function renderPdfChunksAndWriteFile(
  createWindow: PdfRenderWindowFactory,
  filePath: string,
  rawRequest: PdfExportRequest | ValidatedPdfExportRequest,
  options: PdfChunkRenderOptions = {},
): Promise<PdfRenderResult> {
  const request = validatePdfExportRequest(rawRequest);
  const timeoutMs = options.chunkTimeoutMs ?? DEFAULT_CHUNK_TIMEOUT_MS;
  const removePrintDirectory = options.removePrintDirectory ?? ((directory: string) => rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  }));
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new Error("O limite de tempo por lote PDF é inválido.");
  }
  const startedAt = performance.now();
  const mergedDocument = await PDFDocument.create({ updateMetadata: false });
  const printDirectory = await mkdtemp(path.join(os.tmpdir(), "livro-studio-pdf-"));
  let window: PdfRenderWindow | undefined;
  let operationError: unknown;
  let renderedChunkCount = 0;
  try {
    await writeFile(
      path.join(printDirectory, "livro-studio.css"),
      request.cssText,
      { encoding: "utf8", flag: "wx" },
    );
    if (request.assets.length) {
      const assetDirectory = path.join(printDirectory, "assets");
      await mkdir(assetDirectory);
      for (const asset of request.assets) {
        await writeFile(
          path.join(assetDirectory, asset.fileName),
          Buffer.from(asset.data, "base64"),
          { flag: "wx" },
        );
      }
    }
    window = createWindow();
    for (let index = 0; index < request.htmlChunks.length; index += 1) {
      if (window.isDestroyed()) throw new Error("A janela dedicada ao PDF foi encerrada inesperadamente.");
      const documentPath = path.join(printDirectory, `lote-${index + 1}.html`);
      await writeFile(
        documentPath,
        printableDocument(request.htmlChunks[index]),
        { encoding: "utf8", flag: "wx" },
      );
      const buffer = await renderChunk(
        window,
        request,
        index,
        pathToFileURL(documentPath).toString(),
        timeoutMs,
      );
      await appendPdfBuffer(mergedDocument, buffer);
      renderedChunkCount += 1;
      await rm(documentPath, { force: true, maxRetries: 3, retryDelay: 100 });
    }
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    const cleanupErrors: unknown[] = [];
    try {
      if (window && !window.isDestroyed()) window.destroy();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await removePrintDirectory(printDirectory);
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length) {
      if (operationError) {
        throw new AggregateError(
          [operationError, ...cleanupErrors],
          "A exporta\u00e7\u00e3o PDF falhou e os arquivos tempor\u00e1rios n\u00e3o puderam ser removidos.",
        );
      }
      throw cleanupErrors.length === 1
        ? cleanupErrors[0]
        : new AggregateError(cleanupErrors, "Os recursos tempor\u00e1rios do PDF n\u00e3o puderam ser removidos.");
    }
  }

  if (!renderedChunkCount) throw new Error("Nenhum lote PDF foi produzido para mesclagem.");
  const merged = await saveMergedPdf(mergedDocument, request.title);
  const pageCount = countPdfPages(merged);
  if (pageCount !== request.expectedPageCount) {
    throw new Error(
      `O PDF mesclado contém ${pageCount} página(s), mas eram esperadas ${request.expectedPageCount}. `
      + "Nenhum arquivo foi substituído.",
    );
  }
  await writePdfFileAtomic(filePath, merged);
  return {
    byteLength: merged.byteLength,
    pageCount,
    durationMs: performance.now() - startedAt,
  };
}

export async function renderAndWritePdf(
  webContents: WebContents,
  filePath: string,
  request: PdfRenderRequest,
): Promise<PdfRenderResult> {
  const startedAt = performance.now();
  const buffer = await webContents.printToPDF(physicalPrintOptions(request));
  const pageCount = countPdfPages(buffer);
  if (pageCount !== request.expectedPageCount) {
    throw new Error(
      `O Chromium gerou ${pageCount} página(s), mas eram esperadas ${request.expectedPageCount}. `
      + "Nenhum arquivo foi substituído.",
    );
  }
  await writePdfFileAtomic(filePath, buffer);
  return {
    byteLength: buffer.byteLength,
    pageCount,
    durationMs: performance.now() - startedAt,
  };
}
