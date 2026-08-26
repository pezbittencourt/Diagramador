import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultDocument } from "../src/domain/defaultDocument";
import { serializeDocument } from "../src/persistence/documentCodec";
import {
  createBackup,
  createLivroContainer,
  discardRecovery,
  listBackups,
  listRecoveries,
  openProjectFile,
  readLivroContainer,
  writeLivroFile,
  writeRecovery,
} from "./projectFiles";

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

function projectJson() {
  const document = createDefaultDocument(new Date("2026-08-21T12:00:00.000Z"));
  document.assets.push({
    id: "asset-1",
    fileName: "capa.png",
    mimeType: "image/png",
    encoding: "base64",
    data: PNG.toString("base64"),
    pixelWidth: 100,
    pixelHeight: 200,
  });
  document.pages[0].objects.push({
    id: "image-1",
    type: "image",
    anchorMode: "page",
    assetId: "asset-1",
    x: 0,
    y: 0,
    width: 30,
    height: 60,
    originalAspectRatio: 0.5,
    lockAspectRatio: true,
    zIndex: 0,
  });
  return serializeDocument(document);
}

describe("container .livro", () => {
  let directory: string | undefined;
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("separa binários do document.json e faz round-trip", async () => {
    const buffer = await createLivroContainer(projectJson());
    const zip = await JSZip.loadAsync(buffer);
    const internalDocument = await zip.file("document.json")!.async("string");
    expect(internalDocument).not.toContain(PNG.toString("base64"));
    expect(Object.keys(zip.files).some((name) => /^assets\/[a-f0-9]{40}\.png$/u.test(name))).toBe(true);
    const opened = await readLivroContainer(buffer);
    expect(opened.format).toBe("livro");
    expect(opened.warnings).toEqual([]);
    expect(JSON.parse(opened.content).assets[0].data).toBe(PNG.toString("base64"));
  });

  it("recupera o documento quando um único asset está corrompido", async () => {
    const zip = await JSZip.loadAsync(await createLivroContainer(projectJson()));
    const assetName = Object.keys(zip.files).find((name) => name.startsWith("assets/") && !name.endsWith("/"))!;
    zip.file(assetName, Buffer.from("não é uma imagem"));
    const opened = await readLivroContainer(await zip.generateAsync({ type: "nodebuffer" }));
    expect(opened.warnings.join(" ")).toMatch(/corrompido/u);
    expect(JSON.parse(opened.content).assets[0].data).toBe("");
    expect(JSON.parse(opened.content).pages[0].objects[0].assetId).toBe("asset-1");
  });

  it("rejeita containers estruturalmente inválidos sem derrubar o processo", async () => {
    const withoutManifest = await new JSZip().file("document.json", "{}").generateAsync({ type: "nodebuffer" });
    await expect(readLivroContainer(Buffer.from("não é zip"))).rejects.toThrow(/Não foi possível abrir/u);
    await expect(readLivroContainer(withoutManifest)).rejects.toThrow(/Não foi possível abrir/u);
  });

  it("rejeita paths internos não autorizados", async () => {
    const zip = await JSZip.loadAsync(await createLivroContainer(projectJson()));
    zip.file("extras/invasor.txt", "x");
    await expect(readLivroContainer(await zip.generateAsync({ type: "nodebuffer" })))
      .rejects.toThrow(/entrada não autorizada/u);
  });

  it("rejeita JSON interno inválido e referências inconsistentes", async () => {
    const invalidJson = await JSZip.loadAsync(await createLivroContainer(projectJson()));
    invalidJson.file("document.json", "{");
    await expect(readLivroContainer(await invalidJson.generateAsync({ type: "nodebuffer" })))
      .rejects.toThrow(/document\.json/u);

    const inconsistent = await JSZip.loadAsync(await createLivroContainer(projectJson()));
    const document = JSON.parse(await inconsistent.file("document.json")!.async("string"));
    document.pages[0].objects[0].assetId = "missing";
    inconsistent.file("document.json", JSON.stringify(document));
    await expect(readLivroContainer(await inconsistent.generateAsync({ type: "nodebuffer" })))
      .rejects.toThrow(/asset ausente/u);
  });

  it("rejeita taxa de descompressão típica de zip bomb", async () => {
    const document = JSON.parse(projectJson());
    const oversized = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    document.assets[0].data = oversized.toString("base64");
    const buffer = await createLivroContainer(JSON.stringify(document));
    await expect(readLivroContainer(buffer)).rejects.toThrow(/taxa de descompressão/u);
  });

  it("grava, abre e salva novamente preservando o estado", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "livro-roundtrip-"));
    const first = path.join(directory, "primeiro.livro");
    const second = path.join(directory, "segundo.livro");
    await writeLivroFile(first, projectJson());
    const opened = await openProjectFile(first);
    await writeLivroFile(second, opened.content);
    const reopened = await openProjectFile(second);
    expect(JSON.parse(reopened.content)).toEqual(JSON.parse(opened.content));
  });

  it("mantém três backups rotativos e um recovery detectável", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "livro-recovery-"));
    const projectPath = path.join(directory, "romance.livro");
    const backupRoot = path.join(directory, "backups");
    const recoveryRoot = path.join(directory, "recovery");
    await writeLivroFile(projectPath, projectJson());
    for (let index = 0; index < 5; index += 1) await createBackup(backupRoot, "document-test", projectPath);
    expect(await listBackups(backupRoot, "document-test")).toHaveLength(3);
    const content = projectJson().replace("Livro sem título", "Romance recuperado");
    const metadata = await writeRecovery(recoveryRoot, content);
    expect((await listRecoveries(recoveryRoot))[0]).toMatchObject({ documentId: metadata.documentId });
    await discardRecovery(recoveryRoot, metadata.documentId);
    expect(await listRecoveries(recoveryRoot)).toEqual([]);
    expect((await readdir(backupRoot)).length).toBe(1);
    expect((await readFile(projectPath)).subarray(0, 2).toString()).toBe("PK");
  });
});
