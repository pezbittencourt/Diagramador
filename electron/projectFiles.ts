import { copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import JSZip from "jszip";
import { writeFileAtomic, type AtomicWriteOptions } from "./atomicFiles.js";
import { detectImageMimeType, type SupportedImageMime } from "./imageFiles.js";

export const LIVRO_CONTAINER_VERSION = 1;
const FORMAT_NAME = "livro-studio-project";
const MAX_CONTAINER_BYTES = 512 * 1024 * 1024;
const MAX_ENTRIES = 512;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 768 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_ASSET_BYTES = 50 * 1024 * 1024;
const MAX_RUNTIME_DOCUMENT_BYTES = 768 * 1024 * 1024;
const BACKUP_RETENTION = 3;
const MIME_EXTENSION: Record<SupportedImageMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

interface ContainerAsset {
  id: string;
  fileName: string;
  mimeType: SupportedImageMime;
  encoding: "binary";
  storagePath: string;
  pixelWidth: number;
  pixelHeight: number;
}

interface RuntimeAsset extends Omit<ContainerAsset, "encoding" | "storagePath"> {
  encoding: "base64";
  data: string;
}

interface ContainerMetadata {
  format: typeof FORMAT_NAME;
  containerVersion: number;
  kind: "project" | "autosave" | "backup";
  documentId: string;
  title: string;
  schemaVersion: number;
  savedAt: string;
  sourcePath?: string;
  normalSavedAt?: string;
  assetCount: number;
}

interface ValidatedRuntimeDocument {
  source: Record<string, unknown>;
  id: string;
  title: string;
  schemaVersion: number;
  assets: RuntimeAsset[];
}

export interface OpenProjectResult {
  content: string;
  format: "livro" | "legacy-json";
  warnings: string[];
  metadata?: ContainerMetadata;
}

export interface SaveProjectOptions {
  kind?: ContainerMetadata["kind"];
  sourcePath?: string;
  normalSavedAt?: string;
  atomic?: AtomicWriteOptions;
}

function projectError(message: string): never {
  throw new Error(`Não foi possível abrir este projeto porque ${message}`);
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`O projeto é inválido: “${field}” deve ser um objeto.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value || value.length > 1024) {
    throw new Error(`O projeto é inválido: “${field}” deve ser um texto válido.`);
  }
  return value;
}

function finitePositive(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`O projeto é inválido: “${field}” deve ser positivo.`);
  }
  return value;
}

function finite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`O projeto é inválido: “${field}” deve ser um número finito.`);
  }
  return value;
}

function validId(value: unknown, field: string): string {
  const id = text(value, field);
  if (id.length > 256 || /[\u0000-\u001f]/u.test(id)) {
    throw new Error(`O projeto é inválido: “${field}” contém um ID inválido.`);
  }
  return id;
}

function uniqueIds(items: unknown[], field: string): Set<string> {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    const id = validId(object(item, `${field}[${index}]`).id, `${field}[${index}].id`);
    if (ids.has(id)) throw new Error(`O projeto é inválido: ID duplicado em “${field}”.`);
    ids.add(id);
  });
  return ids;
}

function validateRuntimeDocument(content: string): ValidatedRuntimeDocument {
  if (Buffer.byteLength(content, "utf8") > MAX_RUNTIME_DOCUMENT_BYTES) {
    throw new Error("O documento em memória excede o limite seguro.");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("O documento principal não contém JSON válido."); }
  const source = object(parsed, "raiz");
  const schemaVersion = source.schemaVersion;
  if (![1, 2, 3].includes(schemaVersion as number)) {
    throw new Error(`Versão de documento incompatível: ${String(schemaVersion)}.`);
  }
  const id = validId(source.id, "id");
  const title = typeof source.title === "string" ? source.title.slice(0, 1024) : "Livro sem título";
  const pages = Array.isArray(source.pages) ? source.pages : (() => { throw new Error("O projeto é inválido: páginas ausentes."); })();
  const stories = Array.isArray(source.stories) ? source.stories : (() => { throw new Error("O projeto é inválido: conteúdo ausente."); })();
  const styles = Array.isArray(source.styles) ? source.styles : (() => { throw new Error("O projeto é inválido: estilos ausentes."); })();
  const rawAssets = Array.isArray(source.assets) ? source.assets : [];
  if (!pages.length || pages.length > 10_000 || !stories.length || stories.length > 1_000 ||
      !styles.length || styles.length > 10_000 || rawAssets.length > MAX_ENTRIES - 2) {
    throw new Error("O projeto é inválido: uma coleção central está vazia ou excede o limite seguro.");
  }
  if (typeof source.createdAt !== "string" || typeof source.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(source.createdAt)) || !Number.isFinite(Date.parse(source.updatedAt))) {
    throw new Error("O projeto é inválido: datas do documento ausentes ou inválidas.");
  }
  const setup = object(source.pageSetup, "pageSetup");
  finitePositive(setup.width, "pageSetup.width");
  finitePositive(setup.height, "pageSetup.height");
  for (const edgeGroup of ["margins", "bleed"] as const) {
    const edges = object(setup[edgeGroup], `pageSetup.${edgeGroup}`);
    for (const edge of ["top", "bottom", "inner", "outer"] as const) {
      if (finite(edges[edge], `pageSetup.${edgeGroup}.${edge}`) < 0) {
        throw new Error(`O projeto é inválido: “pageSetup.${edgeGroup}.${edge}” não pode ser negativo.`);
      }
    }
  }
  if (typeof setup.mirroredMargins !== "boolean") throw new Error("O projeto é inválido: configuração de margens inválida.");
  object(source.numbering, "numbering");
  object(source.viewSettings, "viewSettings");
  uniqueIds(pages, "pages");
  uniqueIds(stories, "stories");
  uniqueIds(styles, "styles");
  const guides = Array.isArray(source.guides) ? source.guides : [];
  if (guides.length > 10_000) throw new Error("O projeto é inválido: há guias demais.");
  uniqueIds(guides, "guides");
  const assetIds = uniqueIds(rawAssets, "assets");
  const styleIds = new Set(styles.map((style) => validId(object(style, "style").id, "style.id")));
  stories.forEach((story, storyIndex) => {
    const rich = object(object(story, `stories[${storyIndex}]`).content, `stories[${storyIndex}].content`);
    if (rich.type !== "doc" || !Array.isArray(rich.content) || rich.content.length > 1_000_000) {
      throw new Error(`O projeto é inválido: conteúdo da história ${storyIndex + 1} inválido.`);
    }
    const blockIds = new Set<string>();
    rich.content.forEach((blockValue, blockIndex) => {
      const block = object(blockValue, `história ${storyIndex + 1}, bloco ${blockIndex + 1}`);
      const blockId = validId(block.id, "ID de bloco");
      if (blockIds.has(blockId)) throw new Error("O projeto é inválido: ID de bloco duplicado.");
      blockIds.add(blockId);
      if (block.type === "pageBreak") return;
      if (block.type !== "paragraph" || !Array.isArray(block.content)) {
        throw new Error("O projeto é inválido: bloco de texto desconhecido.");
      }
      const attrs = object(block.attrs, "atributos de parágrafo");
      if (!styleIds.has(String(attrs.styleId))) throw new Error(`O parágrafo “${blockId}” referencia um estilo ausente.`);
      block.content.forEach((inlineValue) => {
        const inline = object(inlineValue, "conteúdo inline");
        if (inline.type !== "text" || typeof inline.text !== "string") {
          throw new Error("O projeto é inválido: conteúdo inline desconhecido.");
        }
      });
    });
  });
  const objectIds = new Set<string>();
  let objectCount = 0;
  pages.forEach((page, pageIndex) => {
    const rawObjects = object(page, `pages[${pageIndex}]`).objects;
    if (rawObjects !== undefined && !Array.isArray(rawObjects)) throw new Error("O projeto é inválido: lista de objetos inválida.");
    (rawObjects as unknown[] | undefined ?? []).forEach((item, objectIndex) => {
      objectCount += 1;
      if (objectCount > 100_000) throw new Error("O projeto é inválido: há objetos demais.");
      const positioned = object(item, `pages[${pageIndex}].objects[${objectIndex}]`);
      const objectId = validId(positioned.id, `pages[${pageIndex}].objects[${objectIndex}].id`);
      if (objectIds.has(objectId)) throw new Error("O projeto é inválido: ID de objeto duplicado.");
      objectIds.add(objectId);
      finitePositive(positioned.width, "largura do objeto");
      finitePositive(positioned.height, "altura do objeto");
      finite(positioned.x, "posição X do objeto");
      finite(positioned.y, "posição Y do objeto");
      finite(positioned.zIndex, "ordem do objeto");
      if (positioned.type === "image" && !assetIds.has(String(positioned.assetId))) {
        throw new Error(`O objeto “${objectId}” referencia um asset ausente.`);
      }
    });
  });
  let totalAssetBytes = 0;
  const assets = rawAssets.map((item, index) => {
    const asset = object(item, `assets[${index}]`);
    const mimeType = asset.mimeType;
    if (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/webp") {
      throw new Error(`O asset ${index + 1} possui MIME inválido.`);
    }
    if (asset.encoding !== "base64" || typeof asset.data !== "string") {
      throw new Error(`O asset ${index + 1} não contém dados incorporados válidos.`);
    }
    const validBase64 = asset.data === "" || (asset.data.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/u.test(asset.data));
    const bytes = validBase64 ? Buffer.from(asset.data, "base64") : Buffer.alloc(0);
    totalAssetBytes += bytes.length;
    if (totalAssetBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) throw new Error("Os assets excedem o limite total seguro.");
    if (!validBase64 || bytes.length > MAX_ASSET_BYTES ||
        (asset.data !== "" && detectImageMimeType(bytes) !== mimeType)) {
      throw new Error(`O asset “${String(asset.fileName ?? asset.id)}” está vazio, corrompido ou não corresponde ao MIME.`);
    }
    return {
      id: validId(asset.id, `assets[${index}].id`),
      fileName: text(asset.fileName, `assets[${index}].fileName`),
      mimeType: mimeType as SupportedImageMime,
      encoding: "base64" as const,
      data: asset.data,
      pixelWidth: finitePositive(asset.pixelWidth, `assets[${index}].pixelWidth`),
      pixelHeight: finitePositive(asset.pixelHeight, `assets[${index}].pixelHeight`),
    };
  });
  return { source, id, title, schemaVersion: schemaVersion as number, assets };
}

function storagePath(asset: RuntimeAsset): string {
  const hash = createHash("sha256").update(asset.id, "utf8").digest("hex").slice(0, 40);
  return `assets/${hash}.${MIME_EXTENSION[asset.mimeType]}`;
}

function parseMetadata(source: string): ContainerMetadata {
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { return projectError("metadata.json não contém JSON válido."); }
  const metadata = object(parsed, "metadata.json");
  if (metadata.format !== FORMAT_NAME || metadata.containerVersion !== LIVRO_CONTAINER_VERSION) {
    return projectError("o formato ou a versão do container não é compatível.");
  }
  if (!(["project", "autosave", "backup"] as unknown[]).includes(metadata.kind)) {
    return projectError("o tipo do container é inválido.");
  }
  const savedAt = typeof metadata.savedAt === "string" ? metadata.savedAt : "";
  if (!Number.isFinite(Date.parse(savedAt)) || ![1, 2, 3].includes(metadata.schemaVersion as number) ||
      !Number.isInteger(metadata.assetCount) || (metadata.assetCount as number) < 0 ||
      typeof metadata.title !== "string") {
    return projectError("metadata.json possui campos inválidos.");
  }
  return {
    format: FORMAT_NAME,
    containerVersion: LIVRO_CONTAINER_VERSION,
    kind: metadata.kind as ContainerMetadata["kind"],
    documentId: validId(metadata.documentId, "metadata.documentId"),
    title: metadata.title.slice(0, 1024),
    schemaVersion: metadata.schemaVersion as number,
    savedAt,
    ...(typeof metadata.sourcePath === "string" ? { sourcePath: metadata.sourcePath } : {}),
    ...(typeof metadata.normalSavedAt === "string" ? { normalSavedAt: metadata.normalSavedAt } : {}),
    assetCount: metadata.assetCount as number,
  };
}

function entryUncompressedSize(entry: JSZip.JSZipObject): number {
  const data = (entry as unknown as { _data?: { uncompressedSize?: unknown } })._data;
  return typeof data?.uncompressedSize === "number" ? data.uncompressedSize : 0;
}

function entryCompressedSize(entry: JSZip.JSZipObject): number {
  const data = (entry as unknown as { _data?: { compressedSize?: unknown } })._data;
  return typeof data?.compressedSize === "number" ? data.compressedSize : 0;
}

function validateEntryName(entry: JSZip.JSZipObject): void {
  const original = (entry as unknown as { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name;
  const pathParts = original.split("/").filter((part, index, all) => part || index < all.length - 1);
  if (original.includes("\\") || original.startsWith("/") || /^[A-Za-z]:/u.test(original) ||
      pathParts.some((part) => part === ".." || part === "." || !part)) {
    projectError("o container possui um caminho interno inseguro.");
  }
  if (entry.dir) {
    if (entry.name !== "assets/") projectError(`o container possui uma entrada não autorizada: ${entry.name}.`);
    return;
  }
  if (!entry.dir && entry.name !== "document.json" && entry.name !== "metadata.json" &&
      !/^assets\/[a-f0-9]{40}\.(png|jpg|webp)$/u.test(entry.name)) {
    projectError(`o container possui uma entrada não autorizada: ${entry.name}.`);
  }
}

export async function createLivroContainer(content: string, options: SaveProjectOptions = {}): Promise<Buffer> {
  const validated = validateRuntimeDocument(content);
  const documentForContainer = { ...validated.source, assets: validated.assets.map((asset): ContainerAsset => ({
    id: asset.id,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    encoding: "binary",
    storagePath: storagePath(asset),
    pixelWidth: asset.pixelWidth,
    pixelHeight: asset.pixelHeight,
  })) };
  const metadata: ContainerMetadata = {
    format: FORMAT_NAME,
    containerVersion: LIVRO_CONTAINER_VERSION,
    kind: options.kind ?? "project",
    documentId: validated.id,
    title: validated.title,
    schemaVersion: validated.schemaVersion,
    savedAt: new Date().toISOString(),
    ...(options.sourcePath ? { sourcePath: path.resolve(options.sourcePath) } : {}),
    ...(options.normalSavedAt ? { normalSavedAt: options.normalSavedAt } : {}),
    assetCount: validated.assets.length,
  };
  const zip = new JSZip();
  zip.file("document.json", JSON.stringify(documentForContainer, null, 2));
  zip.file("metadata.json", JSON.stringify(metadata, null, 2));
  validated.assets.forEach((asset) => {
    if (asset.data === "") return;
    zip.file(storagePath(asset), Buffer.from(asset.data, "base64"), {
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  });
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function readLivroContainer(buffer: Buffer): Promise<OpenProjectResult> {
  if (!buffer.length || buffer.length > MAX_CONTAINER_BYTES) return projectError("o container está vazio ou excede 512 MB.");
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(buffer, { createFolders: false }); }
  catch { return projectError("o container ZIP está inválido ou corrompido."); }
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ENTRIES) return projectError("o container possui entradas demais.");
  let total = 0;
  for (const entry of entries) {
    validateEntryName(entry);
    if (entry.dir) continue;
    const size = entryUncompressedSize(entry);
    if (size > MAX_ENTRY_BYTES) return projectError(`a entrada ${entry.name} excede o limite de tamanho.`);
    const compressedSize = entryCompressedSize(entry);
    if (size > 1024 * 1024 && size / Math.max(1, compressedSize) > 200) {
      return projectError(`a taxa de descompressão da entrada ${entry.name} excede o limite seguro.`);
    }
    total += size;
    if (total > MAX_TOTAL_UNCOMPRESSED_BYTES) return projectError("o conteúdo descompactado excede o limite seguro.");
  }
  const documentEntry = zip.file("document.json");
  const metadataEntry = zip.file("metadata.json");
  if (!documentEntry || !metadataEntry) return projectError("document.json ou metadata.json está ausente.");
  if (entryUncompressedSize(documentEntry) > MAX_DOCUMENT_BYTES || entryUncompressedSize(metadataEntry) > MAX_METADATA_BYTES) {
    return projectError("os metadados centrais excedem o limite seguro.");
  }
  const metadata = parseMetadata(await metadataEntry.async("string"));
  let rawDocument: unknown;
  try { rawDocument = JSON.parse(await documentEntry.async("string")); }
  catch { return projectError("document.json está inválido ou corrompido."); }
  const document = object(rawDocument, "document.json");
  if (document.id !== metadata.documentId || document.schemaVersion !== metadata.schemaVersion) {
    return projectError("os metadados não correspondem ao documento principal.");
  }
  const rawAssets = Array.isArray(document.assets) ? document.assets : [];
  const warnings: string[] = [];
  const usedPaths = new Set<string>();
  const hydratedAssets = await Promise.all(rawAssets.map(async (item, index): Promise<RuntimeAsset> => {
    const asset = object(item, `assets[${index}]`);
    const id = validId(asset.id, `assets[${index}].id`);
    const mimeType = asset.mimeType;
    if (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/webp") {
      throw new Error(`O asset “${id}” possui MIME inválido.`);
    }
    const assetPath = text(asset.storagePath, `assets[${index}].storagePath`);
    const expectedPath = storagePath({
      id, mimeType, fileName: String(asset.fileName), encoding: "base64", data: "",
      pixelWidth: Number(asset.pixelWidth), pixelHeight: Number(asset.pixelHeight),
    });
    if (asset.encoding !== "binary" || assetPath !== expectedPath || usedPaths.has(assetPath)) {
      throw new Error(`O asset “${id}” possui referência interna inválida.`);
    }
    usedPaths.add(assetPath);
    const entry = zip.file(assetPath);
    let data = "";
    if (!entry) {
      warnings.push(`Asset ausente: ${String(asset.fileName ?? id)}.`);
    } else {
      try {
        const bytes = await entry.async("nodebuffer");
        if (bytes.length > MAX_ASSET_BYTES || detectImageMimeType(bytes) !== mimeType) {
          warnings.push(`Asset inválido ou corrompido: ${String(asset.fileName ?? id)}.`);
        } else data = bytes.toString("base64");
      } catch {
        warnings.push(`Não foi possível descompactar o asset: ${String(asset.fileName ?? id)}.`);
      }
    }
    return {
      id,
      fileName: text(asset.fileName, `assets[${index}].fileName`),
      mimeType,
      encoding: "base64",
      data,
      pixelWidth: finitePositive(asset.pixelWidth, `assets[${index}].pixelWidth`),
      pixelHeight: finitePositive(asset.pixelHeight, `assets[${index}].pixelHeight`),
    };
  }));
  if (metadata.assetCount !== rawAssets.length) warnings.push("A contagem de assets do manifesto está inconsistente.");
  const unusedAssets = entries.filter((entry) => !entry.dir && entry.name.startsWith("assets/") && !usedPaths.has(entry.name));
  if (unusedAssets.length) return projectError("o container possui assets não referenciados pelo documento.");
  const content = JSON.stringify({ ...document, assets: hydratedAssets });
  try { validateRuntimeDocument(content); }
  catch (error) {
    return projectError(error instanceof Error ? error.message : "a estrutura do documento é inconsistente.");
  }
  return { content, format: "livro", warnings, metadata };
}

export async function openProjectFile(filePath: string): Promise<OpenProjectResult> {
  const buffer = await readFile(filePath);
  if (path.extname(filePath).toLowerCase() === ".livro" || buffer.subarray(0, 2).toString("binary") === "PK") {
    return readLivroContainer(buffer);
  }
  if (buffer.length > MAX_RUNTIME_DOCUMENT_BYTES) return projectError("o JSON legado excede o limite seguro de 768 MB.");
  return { content: buffer.toString("utf8"), format: "legacy-json", warnings: [] };
}

export async function writeLivroFile(filePath: string, content: string, options: SaveProjectOptions = {}): Promise<ContainerMetadata> {
  const buffer = await createLivroContainer(content, options);
  await writeFileAtomic(filePath, buffer, {
    validate: async (candidate) => { await readLivroContainer(candidate); },
    ...options.atomic,
  });
  return (await readLivroContainer(buffer)).metadata!;
}

function safeDocumentDirectoryName(documentId: string): string {
  return createHash("sha256").update(documentId, "utf8").digest("hex");
}

export async function writeRecovery(
  recoveryRoot: string,
  content: string,
  sourcePath?: string,
  normalSavedAt?: string,
): Promise<ContainerMetadata> {
  const validated = validateRuntimeDocument(content);
  const directory = path.join(recoveryRoot, safeDocumentDirectoryName(validated.id));
  await mkdir(directory, { recursive: true });
  return writeLivroFile(path.join(directory, "recovery.livro"), content, {
    kind: "autosave", sourcePath, normalSavedAt,
  });
}

export async function discardRecovery(recoveryRoot: string, documentId: string): Promise<void> {
  await rm(path.join(recoveryRoot, safeDocumentDirectoryName(documentId)), { recursive: true, force: true });
}

export interface RecoveryCandidate {
  documentId: string;
  title: string;
  savedAt: string;
  sourcePath?: string;
  filePath: string;
}

export async function listRecoveries(recoveryRoot: string): Promise<RecoveryCandidate[]> {
  let directories: string[];
  try { directories = await readdir(recoveryRoot); } catch { return []; }
  const candidates: RecoveryCandidate[] = [];
  for (const directory of directories.slice(0, 100)) {
    const filePath = path.join(recoveryRoot, directory, "recovery.livro");
    try {
      const opened = await openProjectFile(filePath);
      const metadata = opened.metadata;
      if (!metadata || metadata.kind !== "autosave") continue;
      let newer = true;
      if (metadata.sourcePath) {
        try { newer = new Date(metadata.savedAt).getTime() > (await stat(metadata.sourcePath)).mtimeMs; }
        catch { newer = true; }
      }
      if (newer) candidates.push({
        documentId: metadata.documentId,
        title: metadata.title,
        savedAt: metadata.savedAt,
        sourcePath: metadata.sourcePath,
        filePath,
      });
    } catch {
      // Recovery inválido é ignorado aqui e permanece disponível para diagnóstico.
    }
  }
  return candidates.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function createBackup(backupRoot: string, documentId: string, sourcePath: string): Promise<void> {
  try { await stat(sourcePath); } catch { return; }
  try {
    const opened = await openProjectFile(sourcePath);
    if (opened.format !== "livro") return;
  } catch {
    return;
  }
  const directory = path.join(backupRoot, safeDocumentDirectoryName(documentId));
  await mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const destination = path.join(directory, `${stamp}-${randomUUID()}.livro`);
  await copyFile(sourcePath, destination);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".livro")).sort().reverse();
  await Promise.all(files.slice(BACKUP_RETENTION).map((name) => rm(path.join(directory, name), { force: true })));
}

export interface BackupCandidate { filePath: string; savedAt: string; title: string; }

export async function listBackups(backupRoot: string, documentId: string): Promise<BackupCandidate[]> {
  const directory = path.join(backupRoot, safeDocumentDirectoryName(documentId));
  let files: string[];
  try { files = (await readdir(directory)).filter((name) => name.endsWith(".livro")).sort().reverse(); }
  catch { return []; }
  const result: BackupCandidate[] = [];
  for (const name of files.slice(0, BACKUP_RETENTION)) {
    const filePath = path.join(directory, name);
    try {
      const opened = await openProjectFile(filePath);
      result.push({ filePath, savedAt: opened.metadata?.savedAt ?? (await stat(filePath)).mtime.toISOString(), title: opened.metadata?.title ?? "Projeto" });
    } catch { /* backup corrompido não é oferecido */ }
  }
  return result;
}
