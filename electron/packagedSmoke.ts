import { BrowserWindow } from "electron";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { APP_VERSION } from "./appMetadata.js";
import { importManuscriptFile } from "./manuscriptFiles.js";
import {
  createBackup,
  listBackups,
  listRecoveries,
  openProjectFile,
  writeLivroFile,
  writeRecovery,
} from "./projectFiles.js";
import { renderPdfChunksAndWriteFile, validatePdfExportRequest } from "./pdfExport.js";

export interface PackagedSmokeOptions {
  root: string;
  userData: string;
  renderer: string;
  preload: string;
}

async function inspectPackagedRenderer(renderer: string, preload: string) {
  const diagnostics: string[] = [];
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      devTools: false,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  try {
    window.webContents.on("console-message", (_event, level, message) => {
      diagnostics.push(`console:${level}:${message}`);
    });
    window.webContents.on("preload-error", (_event, preloadPath, error) => {
      diagnostics.push(`preload:${preloadPath}:${error.message}`);
    });
    window.webContents.on("render-process-gone", (_event, details) => {
      diagnostics.push(`renderer-gone:${details.reason}:${details.exitCode}`);
    });
    await window.loadFile(renderer);
    const initialState = await window.webContents.executeJavaScript(`({
      readyState: document.readyState,
      hasRoot: Boolean(document.querySelector('#root')),
      hasShell: Boolean(document.querySelector('.app-shell')),
      hasApi: Boolean(window.livroStudio),
      bodyText: document.body.innerText.slice(0, 300),
    })`);
    try {
      return await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (document.querySelector('.app-shell') && window.livroStudio) {
          clearInterval(timer);
          resolve({
            appShell: true,
            version: window.livroStudio.version,
            nodeProcessExposed: typeof window.process !== 'undefined',
            requireExposed: typeof window.require !== 'undefined',
            title: document.title,
          });
        } else if (Date.now() - started > 15000) {
          clearInterval(timer);
          reject(new Error('Renderer empacotado não inicializou em 15 segundos.'));
        }
      }, 50);
    })`);
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)} Estado inicial: ${JSON.stringify(initialState)}. Diagnóstico: ${diagnostics.join(" | ") || "vazio"}`);
    }
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

export async function runPackagedSmoke(options: PackagedSmokeOptions): Promise<void> {
  await mkdir(options.root, { recursive: true });
  const sourcePath = path.join(options.root, "source.livro");
  const docxPath = path.join(options.root, "source.docx");
  const savedPath = path.join(options.root, "salvo com espaços e acentos.livro");
  const pdfPath = path.join(options.root, "exportação empacotada.pdf");
  const reportPath = path.join(options.root, "report.json");
  try {
    const renderer = await inspectPackagedRenderer(options.renderer, options.preload);
    const sourceOpenStarted = performance.now();
    const source = await openProjectFile(sourcePath);
    const sourceOpenMs = performance.now() - sourceOpenStarted;
    const editedDocument = JSON.parse(source.content) as {
      title: string;
      updatedAt: string;
      stories: Array<{ content: { content: Array<{ content?: Array<{ text?: string }> }> } }>;
    };
    editedDocument.title = "Smoke empacotado editado";
    editedDocument.updatedAt = new Date().toISOString();
    const firstText = editedDocument.stories[0]?.content.content[0]?.content?.[0];
    if (firstText?.text) firstText.text += " Edição salva pelo executável empacotado.";
    const saveStarted = performance.now();
    const metadata = await writeLivroFile(savedPath, JSON.stringify(editedDocument), { kind: "project" });
    const saveMs = performance.now() - saveStarted;
    const reopenStarted = performance.now();
    const reopened = await openProjectFile(savedPath);
    const reopenMs = performance.now() - reopenStarted;
    await writeLivroFile(savedPath, reopened.content, { kind: "project" });

    const recoveryRoot = path.join(options.userData, "recovery");
    const backupRoot = path.join(options.userData, "backups");
    await writeRecovery(recoveryRoot, reopened.content, savedPath, metadata.savedAt);
    const recoveries = await listRecoveries(recoveryRoot);
    await createBackup(backupRoot, metadata.documentId, savedPath);
    const backups = await listBackups(backupRoot, metadata.documentId);
    const manuscript = await importManuscriptFile(docxPath);

    const runtimeDocument = JSON.parse(reopened.content) as {
      pages: unknown[];
      assets: Array<{ mimeType: "image/png" | "image/jpeg" | "image/webp"; data: string }>;
    };
    const pdfPageCount = Math.min(100, Math.max(1, runtimeDocument.pages.length));
    const pdfAssets = runtimeDocument.assets.slice(0, Math.min(40, pdfPageCount)).map((asset, index) => ({
      fileName: `asset-${index + 1}.${asset.mimeType === "image/jpeg" ? "jpg" : asset.mimeType.split("/")[1]}`,
      mimeType: asset.mimeType,
      data: asset.data,
    }));
    const articles = Array.from({ length: pdfPageCount }, (_, index) => {
      const image = pdfAssets[index]
        ? `<img src="./assets/${pdfAssets[index].fileName}" alt="">`
        : "";
      return `<article class="pdf-export-page" data-output-page="${index + 1}" data-physical-page="${index + 1}">`
        + `<h1>Página empacotada ${index + 1}</h1><p>Livro Studio PDF empacotado com texto selecionável.</p>${image}</article>`;
    });
    const htmlChunks: string[] = [];
    for (let index = 0; index < articles.length; index += 20) htmlChunks.push(articles.slice(index, index + 20).join(""));
    const pdfRequest = validatePdfExportRequest({
      suggestedName: "exportação empacotada.pdf",
      title: "Smoke empacotado",
      widthMm: 148,
      heightMm: 210,
      expectedPageCount: pdfPageCount,
      cssText: "@page{size:148mm 210mm;margin:0}html,body{margin:0}.pdf-export-page{position:relative;box-sizing:border-box;width:148mm;height:210mm;padding:20mm;page-break-after:always;font:12pt Georgia,serif}.pdf-export-page img{position:absolute;left:20mm;top:50mm;width:30mm;height:30mm}",
      htmlChunks,
      assets: pdfAssets,
    });
    const rssBeforePdf = process.memoryUsage().rss;
    const pdf = await renderPdfChunksAndWriteFile(
      () => new BrowserWindow({
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
      }),
      pdfPath,
      pdfRequest,
    );
    const rssAfterPdf = process.memoryUsage().rss;

    const sourceBytes = await readFile(sourcePath);
    const savedBytes = await readFile(savedPath);
    const report = {
      success: true,
      appVersion: APP_VERSION,
      renderer,
      livro: {
        sourceZip: sourceBytes.subarray(0, 2).toString() === "PK",
        savedZip: savedBytes.subarray(0, 2).toString() === "PK",
        format: reopened.format,
        editedTitle: JSON.parse(reopened.content).title,
        warnings: reopened.warnings,
        bytes: savedBytes.byteLength,
      },
      docx: {
        format: manuscript.format,
        hasText: manuscript.text.includes("DOCX empacotado"),
        warnings: manuscript.warnings,
      },
      recoveryCount: recoveries.length,
      backupCount: backups.length,
      pdf: { ...pdf, bytesOnDisk: (await stat(pdfPath)).size },
      performance: {
        sourceOpenMs,
        saveMs,
        reopenMs,
        pdfRssDeltaBytes: rssAfterPdf - rssBeforePdf,
      },
      paths: { userData: options.userData, savedPath, pdfPath },
    };
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  } catch (error) {
    await writeFile(reportPath, JSON.stringify({
      success: false,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
    }, null, 2), "utf8");
    throw error;
  }
}
