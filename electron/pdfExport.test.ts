import type { PrintToPDFOptions, WebContents } from "electron";
import { access, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pdfFileMocks = vi.hoisted(() => ({
  countPdfPages: vi.fn<(buffer: Buffer) => number>(),
  writePdfFileAtomic: vi.fn<(filePath: string, buffer: Buffer) => Promise<void>>(),
}));

vi.mock("./pdfFiles.js", () => pdfFileMocks);

import {
  renderAndWritePdf,
  renderPdfChunksAndWriteFile,
  validatePdfExportRequest,
  type PdfExportRequest,
  type PdfRenderWindow,
} from "./pdfExport";

function createWebContents(
  printToPDF: (options: PrintToPDFOptions) => Promise<Buffer>,
): WebContents {
  return { printToPDF } as unknown as WebContents;
}

function htmlChunk(pageCount: number, marker: string, firstPage = 1): string {
  const pages = Array.from(
    { length: pageCount },
    (_, index) => `<article class="pdf-export-page" data-output-page="${firstPage + index}" `
      + `data-physical-page="${firstPage + index}" data-marker="${marker}-${index + 1}"></article>`,
  ).join("");
  return `<section class="pdf-export-root">${pages}</section>`;
}

function chunkRequest(htmlChunks: string[], expectedPageCount: number): PdfExportRequest {
  return {
    suggestedName: "livro.pdf",
    title: "Título do benchmark",
    widthMm: 154,
    heightMm: 216,
    expectedPageCount,
    cssText: ".pdf-export-page { break-after: page; }",
    htmlChunks,
    assets: [],
  };
}

async function pdfWithPageWidths(widths: number[]): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (const width of widths) document.addPage([width, 300]);
  return Buffer.from(await document.save({ useObjectStreams: false }));
}

function uncompressedPageCount(buffer: Buffer): number {
  return buffer.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

function createRenderWindow(printToPDF: (options: PrintToPDFOptions) => Promise<Buffer>) {
  let destroyed = false;
  const window: PdfRenderWindow = {
    webContents: {
      executeJavaScript: vi.fn().mockResolvedValue(true),
      printToPDF: vi.fn(printToPDF),
    } as unknown as PdfRenderWindow["webContents"],
    loadURL: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(() => { destroyed = true; }),
    isDestroyed: vi.fn(() => destroyed),
  };
  return window;
}

describe("renderAndWritePdf", () => {
  beforeEach(() => {
    pdfFileMocks.countPdfPages.mockReset();
    pdfFileMocks.writePdfFileAtomic.mockReset();
    pdfFileMocks.writePdfFileAtomic.mockResolvedValue(undefined);
  });

  it("imprime em unidades físicas e grava atomicamente o buffer validado", async () => {
    const buffer = Buffer.from("pdf produzido pelo Chromium");
    const printToPDF = vi.fn<(options: PrintToPDFOptions) => Promise<Buffer>>()
      .mockResolvedValue(buffer);
    pdfFileMocks.countPdfPages.mockReturnValue(2);

    const result = await renderAndWritePdf(
      createWebContents(printToPDF),
      "C:\\exports\\livro.pdf",
      { widthMm: 154, heightMm: 216, expectedPageCount: 2 },
    );

    expect(printToPDF).toHaveBeenCalledOnce();
    expect(printToPDF).toHaveBeenCalledWith({
      displayHeaderFooter: false,
      generateDocumentOutline: false,
      generateTaggedPDF: false,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      pageSize: {
        width: 154 / 25.4,
        height: 216 / 25.4,
      },
      preferCSSPageSize: true,
      printBackground: true,
      scale: 1,
    });
    expect(pdfFileMocks.countPdfPages).toHaveBeenCalledOnce();
    expect(pdfFileMocks.countPdfPages).toHaveBeenCalledWith(buffer);
    expect(pdfFileMocks.writePdfFileAtomic).toHaveBeenCalledOnce();
    expect(pdfFileMocks.writePdfFileAtomic).toHaveBeenCalledWith(
      "C:\\exports\\livro.pdf",
      buffer,
    );
    expect(result).toEqual({
      byteLength: buffer.byteLength,
      pageCount: 2,
      durationMs: expect.any(Number),
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("não grava quando o Chromium produz uma quantidade inesperada de páginas", async () => {
    const buffer = Buffer.from("pdf com páginas divergentes");
    const printToPDF = vi.fn<(options: PrintToPDFOptions) => Promise<Buffer>>()
      .mockResolvedValue(buffer);
    pdfFileMocks.countPdfPages.mockReturnValue(3);

    await expect(renderAndWritePdf(
      createWebContents(printToPDF),
      "C:\\exports\\livro.pdf",
      { widthMm: 148, heightMm: 210, expectedPageCount: 2 },
    )).rejects.toThrow("O Chromium gerou 3 página(s), mas eram esperadas 2");

    expect(pdfFileMocks.countPdfPages).toHaveBeenCalledWith(buffer);
    expect(pdfFileMocks.writePdfFileAtomic).not.toHaveBeenCalled();
  });

  it("não valida nem grava quando a impressão do Chromium falha", async () => {
    const printError = new Error("Falha interna do pipeline de impressão.");
    const printToPDF = vi.fn<(options: PrintToPDFOptions) => Promise<Buffer>>()
      .mockRejectedValue(printError);

    await expect(renderAndWritePdf(
      createWebContents(printToPDF),
      "C:\\exports\\livro.pdf",
      { widthMm: 148, heightMm: 210, expectedPageCount: 1 },
    )).rejects.toBe(printError);

    expect(pdfFileMocks.countPdfPages).not.toHaveBeenCalled();
    expect(pdfFileMocks.writePdfFileAtomic).not.toHaveBeenCalled();
  });

  it("valida a quantidade de páginas de cada lote e a soma física", () => {
    expect(() => validatePdfExportRequest(chunkRequest([htmlChunk(25, "a")], 25))).not.toThrow();
    expect(() => validatePdfExportRequest(chunkRequest([htmlChunk(26, "a")], 26)))
      .toThrow("deve conter entre 1 e 25 páginas PDF");
    expect(() => validatePdfExportRequest(chunkRequest([htmlChunk(2, "a")], 3)))
      .toThrow("contêm 2 página(s), mas eram esperadas 3");
  });

  it("mescla lotes na ordem, define metadados e grava atomicamente uma única vez", async () => {
    const firstChunk = await pdfWithPageWidths([101, 102]);
    const secondChunk = await pdfWithPageWidths([201]);
    const printToPDF = vi.fn<(options: PrintToPDFOptions) => Promise<Buffer>>()
      .mockResolvedValueOnce(firstChunk)
      .mockResolvedValueOnce(secondChunk);
    const window = createRenderWindow(printToPDF);
    const createWindow = vi.fn(() => window);
    pdfFileMocks.countPdfPages.mockImplementation(uncompressedPageCount);

    const result = await renderPdfChunksAndWriteFile(
      createWindow,
      "C:\\exports\\livro.pdf",
      chunkRequest([htmlChunk(2, "primeiro"), htmlChunk(1, "segundo", 3)], 3),
      { chunkTimeoutMs: 1_000 },
    );

    expect(createWindow).toHaveBeenCalledOnce();
    expect(window.loadURL).toHaveBeenCalledTimes(2);
    const loadedDocumentUrls = vi.mocked(window.loadURL).mock.calls.map(([url]) => url);
    expect(loadedDocumentUrls.every((url) => url.startsWith("file:"))).toBe(true);
    expect(window.webContents.executeJavaScript).toHaveBeenCalledTimes(2);
    expect(printToPDF).toHaveBeenCalledTimes(2);
    expect(window.destroy).toHaveBeenCalledOnce();
    expect(pdfFileMocks.writePdfFileAtomic).toHaveBeenCalledOnce();
    expect(pdfFileMocks.writePdfFileAtomic).toHaveBeenCalledWith(
      "C:\\exports\\livro.pdf",
      expect.any(Buffer),
    );

    const mergedBuffer = pdfFileMocks.writePdfFileAtomic.mock.calls[0][1];
    const merged = await PDFDocument.load(mergedBuffer, { updateMetadata: false });
    expect(merged.getPages().map((page) => page.getWidth())).toEqual([101, 102, 201]);
    expect(merged.getTitle()).toBe("Título do benchmark");
    expect(merged.getCreator()).toBe("Livro Studio 1.0.0");
    expect(merged.getProducer()).toBe("Livro Studio 1.0.0");
    expect(result).toEqual({
      byteLength: mergedBuffer.byteLength,
      pageCount: 3,
      durationMs: expect.any(Number),
    });
    await Promise.all(loadedDocumentUrls.map(async (url) => {
      await expect(access(fileURLToPath(url))).rejects.toThrow();
    }));
  });

  it("não mescla nem grava quando qualquer lote falha", async () => {
    const firstChunk = await pdfWithPageWidths([101]);
    const printError = new Error("Falha do Chromium no segundo lote.");
    const printToPDF = vi.fn<(options: PrintToPDFOptions) => Promise<Buffer>>()
      .mockResolvedValueOnce(firstChunk)
      .mockRejectedValueOnce(printError);
    const window = createRenderWindow(printToPDF);
    pdfFileMocks.countPdfPages.mockImplementation(uncompressedPageCount);

    await expect(renderPdfChunksAndWriteFile(
      () => window,
      "C:\\exports\\livro.pdf",
      chunkRequest([htmlChunk(1, "primeiro"), htmlChunk(1, "segundo", 2)], 2),
      { chunkTimeoutMs: 1_000 },
    )).rejects.toBe(printError);

    expect(printToPDF).toHaveBeenCalledTimes(2);
    expect(window.destroy).toHaveBeenCalledOnce();
    expect(pdfFileMocks.writePdfFileAtomic).not.toHaveBeenCalled();
  });

  it("destrói a janela e não grava quando um lote excede o tempo limite", async () => {
    const printToPDF = vi.fn<(options: PrintToPDFOptions) => Promise<Buffer>>()
      .mockReturnValue(new Promise<Buffer>(() => undefined));
    const window = createRenderWindow(printToPDF);

    await expect(renderPdfChunksAndWriteFile(
      () => window,
      "C:\\exports\\livro.pdf",
      chunkRequest([htmlChunk(1, "lento")], 1),
      { chunkTimeoutMs: 10 },
    )).rejects.toThrow("lote PDF 1 excedeu 1 segundos");

    expect(window.destroy).toHaveBeenCalledOnce();
    expect(pdfFileMocks.countPdfPages).not.toHaveBeenCalled();
    expect(pdfFileMocks.writePdfFileAtomic).not.toHaveBeenCalled();
  });

  it("repete uma carga file: transitoriamente recusada sem desativar o sandbox", async () => {
    const chunkPdf = await pdfWithPageWidths([148]);
    const window = createRenderWindow(vi.fn().mockResolvedValue(chunkPdf));
    vi.mocked(window.loadURL)
      .mockRejectedValueOnce(new Error("ERR_FAILED loading file:"))
      .mockRejectedValueOnce(new Error("ERR_FAILED loading file:"))
      .mockResolvedValue(undefined);
    pdfFileMocks.countPdfPages.mockImplementation(uncompressedPageCount);

    await renderPdfChunksAndWriteFile(
      () => window,
      "C:\\exports\\livro.pdf",
      chunkRequest([htmlChunk(1, "retry")], 1),
    );

    expect(window.loadURL).toHaveBeenCalledTimes(3);
    expect(pdfFileMocks.writePdfFileAtomic).toHaveBeenCalledOnce();
  });

  it("materializa CSS e assets desduplicados uma vez e remove os temporarios", async () => {
    const chunkPdf = await pdfWithPageWidths([148]);
    const printToPDF = vi.fn<(options: PrintToPDFOptions) => Promise<Buffer>>()
      .mockResolvedValue(chunkPdf);
    const window = createRenderWindow(printToPDF);
    const request = chunkRequest([
      htmlChunk(1, "imagem").replace(
        "</article>",
        '<img src="./assets/asset-1.png" alt=""></article>',
      ),
    ], 1);
    request.assets = [{
      fileName: "asset-1.png",
      mimeType: "image/png",
      data: "iVBORw0KGgo=",
    }];
    let loadedDocumentUrl = "";
    vi.mocked(window.loadURL).mockImplementation(async (url) => {
      loadedDocumentUrl = url;
      const html = await readFile(fileURLToPath(url), "utf8");
      expect(html).toContain('href="./livro-studio.css"');
      expect(html).toContain('src="./assets/asset-1.png"');
      expect(await readFile(fileURLToPath(new URL("./livro-studio.css", url)), "utf8"))
        .toBe(request.cssText);
      expect(await readFile(fileURLToPath(new URL("./assets/asset-1.png", url))))
        .toEqual(Buffer.from(request.assets[0].data, "base64"));
    });
    pdfFileMocks.countPdfPages.mockImplementation(uncompressedPageCount);

    await renderPdfChunksAndWriteFile(
      () => window,
      "C:\\exports\\livro.pdf",
      request,
      { chunkTimeoutMs: 1_000 },
    );

    expect(loadedDocumentUrl.startsWith("file:")).toBe(true);
    await expect(access(fileURLToPath(loadedDocumentUrl))).rejects.toThrow();
    await expect(access(fileURLToPath(new URL("./assets/asset-1.png", loadedDocumentUrl))))
      .rejects.toThrow();
  });

  it("rejeita identidade fora de ordem e referencias de imagem nao autorizadas", () => {
    const duplicateOutput = chunkRequest([
      htmlChunk(2, "ordem").replace('data-output-page="2"', 'data-output-page="1"'),
    ], 2);
    expect(() => validatePdfExportRequest(duplicateOutput)).toThrow("ordem de sa");

    const unauthorizedImage = chunkRequest([
      htmlChunk(1, "externa").replace(
        "</article>",
        '<img src="file:///C:/segredo.png"></article>',
      ),
    ], 1);
    expect(() => validatePdfExportRequest(unauthorizedImage)).toThrow("recurso de imagem");

    const invalidSignature = chunkRequest([
      htmlChunk(1, "assinatura").replace(
        "</article>",
        '<img src="./assets/asset-1.png"></article>',
      ),
    ], 1);
    invalidSignature.assets = [{
      fileName: "asset-1.png",
      mimeType: "image/png",
      data: "AAAA",
    }];
    expect(() => validatePdfExportRequest(invalidSignature)).toThrow("conte");
  });

  it("preserva o erro operacional quando a limpeza temporaria tambem falha", async () => {
    const printError = new Error("Falha original de impressao.");
    const cleanupError = new Error("Falha simulada de limpeza.");
    const window = createRenderWindow(vi.fn().mockRejectedValue(printError));

    let received: unknown;
    try {
      await renderPdfChunksAndWriteFile(
        () => window,
        "C:\\exports\\livro.pdf",
        chunkRequest([htmlChunk(1, "falha-dupla")], 1),
        {
          chunkTimeoutMs: 1_000,
          removePrintDirectory: async (directory) => {
            await rm(directory, { recursive: true, force: true });
            throw cleanupError;
          },
        },
      );
    } catch (error) {
      received = error;
    }

    expect(received).toBeInstanceOf(AggregateError);
    expect((received as AggregateError).errors).toEqual([printError, cleanupError]);
    expect(pdfFileMocks.writePdfFileAtomic).not.toHaveBeenCalled();
  });
});
