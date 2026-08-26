const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const JSZip = require("jszip");

const root = path.resolve(__dirname, "..");
const executable = process.env.LIVRO_STUDIO_PACKAGED_EXECUTABLE
  ? path.resolve(process.env.LIVRO_STUDIO_PACKAGED_EXECUTABLE)
  : path.join(root, "release", "win-unpacked", "Livro Studio.exe");
const evidenceDirectory = path.join(root, ".tmp", "packaged-smoke");
const benchmarkMode = process.argv.includes("--benchmark");
const outputEvidenceDirectory = benchmarkMode
  ? path.join(root, ".tmp", "packaged-benchmark")
  : evidenceDirectory;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XfJ8WQAAAABJRU5ErkJggg==", "base64");

function buildDocument() {
  return {
    schemaVersion: 3,
    id: "packaged-smoke-document",
    title: "Smoke empacotado",
    createdAt: "2026-08-21T12:00:00.000Z",
    updatedAt: "2026-08-21T12:00:00.000Z",
    pageSetup: {
      preset: "A5", width: 148, height: 210, mirroredMargins: true,
      margins: { top: 18, bottom: 20, inner: 20, outer: 15 },
      bleed: { top: 3, bottom: 3, inner: 3, outer: 3 },
    },
    viewSettings: {
      showMargins: true, showBleed: true, showRulers: true,
      showCustomGuides: true, snapEnabled: true, viewMode: "spread",
    },
    guides: [],
    pages: [{
      id: "page-1",
      objects: [{
        id: "image-1", type: "image", anchorMode: "page", assetId: "asset-1",
        x: 10, y: 10, width: 25, height: 25, zIndex: 0,
        originalAspectRatio: 1, lockAspectRatio: true,
      }],
    }],
    stories: [{
      id: "main-story",
      name: "Texto principal",
      content: { type: "doc", content: [{
        type: "paragraph", id: "paragraph-1", attrs: { styleId: "body" },
        content: [{ type: "text", text: "Texto criado para o smoke da distribuição Windows." }],
      }] },
    }],
    styles: [{
      id: "body", name: "Corpo", fontFamily: "Georgia", fontSizePt: 11,
      fontWeight: 400, italic: false, underline: false, color: "#222520",
      lineHeight: 1.35, alignment: "justify", spaceBeforePt: 0, spaceAfterPt: 6,
      firstLineIndentMm: 5, leftIndentMm: 0, rightIndentMm: 0,
    }],
    numbering: {
      ranges: [{ id: "main", fromPhysicalIndex: 0, logicalStart: 1, format: "arabic" }],
      display: { defaultVisible: true, logicalRanges: [], hiddenLogicalNumbers: [], hiddenPageIds: [] },
      placement: { vertical: "bottom", horizontal: "outer", mirrorOnFacingPages: true },
    },
    assets: [{
      id: "asset-1", fileName: "imagem de teste.png", mimeType: "image/png",
      encoding: "base64", data: png.toString("base64"), pixelWidth: 1, pixelHeight: 1,
    }],
  };
}

async function createDocx(destination) {
  const source = path.join(root, "node_modules", "mammoth", "test", "test-data", "single-paragraph.docx");
  const zip = await JSZip.loadAsync(await fs.readFile(source));
  const xml = await zip.file("word/document.xml").async("string");
  zip.file("word/document.xml", xml.replace(/<w:t[^>]*>.*?<\/w:t>/u, "<w:t>DOCX empacotado</w:t>"));
  await fs.writeFile(destination, await zip.generateAsync({ type: "nodebuffer" }));
}

function runExecutable(smokeRoot) {
  return new Promise((resolve, reject) => {
    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable, [`--livro-studio-packaged-smoke=${smokeRoot}`], {
      env: environment,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("O smoke empacotado excedeu 180 segundos."));
    }, 180_000);
    child.once("error", reject);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Executável empacotado encerrou com código ${code}.\n${stdout}\n${stderr}`));
    });
  });
}

async function main() {
  await fs.access(executable);
  const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "livro-studio-packaged-"));
  const projectFiles = await import(pathToFileURL(path.join(root, "dist-electron", "projectFiles.js")).href);
  if (benchmarkMode) {
    await fs.copyFile(path.join(root, ".tmp", "project-benchmark", "benchmark.livro"), path.join(smokeRoot, "source.livro"));
  } else {
    await projectFiles.writeLivroFile(path.join(smokeRoot, "source.livro"), JSON.stringify(buildDocument()));
  }
  const legacyDocument = buildDocument();
  legacyDocument.schemaVersion = 1;
  legacyDocument.title = "JSON legado schema 1";
  await fs.writeFile(path.join(smokeRoot, "legado com acentos schema 1.json"), JSON.stringify(legacyDocument), "utf8");
  await createDocx(path.join(smokeRoot, "source.docx"));
  await runExecutable(smokeRoot);
  const report = JSON.parse(await fs.readFile(path.join(smokeRoot, "report.json"), "utf8"));
  if (!report.success || report.appVersion !== "1.0.0" || report.livro.editedTitle !== "Smoke empacotado editado"
      || !report.docx.hasText || report.recoveryCount < 1 || report.backupCount < 1
      || report.pdf.pageCount !== (benchmarkMode ? 100 : 1)
      || report.renderer.nodeProcessExposed || report.renderer.requireExposed) {
    throw new Error(`Relatório empacotado inválido:\n${JSON.stringify(report, null, 2)}`);
  }
  await fs.rm(outputEvidenceDirectory, { recursive: true, force: true });
  await fs.cp(smokeRoot, outputEvidenceDirectory, { recursive: true });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
