import zlib from "node:zlib";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { applyPdfXOutputIntent } from "./pdfOutputIntent";

const FAKE_ICC_PROFILE = new Uint8Array(
  Array.from({ length: 64 }, (_, index) => index % 256),
);

async function buildDocument(): Promise<PDFDocument> {
  const document = await PDFDocument.create({ updateMetadata: false });
  document.addPage([100, 100]);
  return document;
}

async function roundTrip(document: PDFDocument): Promise<PDFDocument> {
  const bytes = await document.save({ useObjectStreams: false });
  return PDFDocument.load(bytes, { updateMetadata: false });
}

function firstOutputIntent(document: PDFDocument): PDFDict {
  const intents = document.catalog.lookup(PDFName.of("OutputIntents"), PDFArray);
  expect(intents.size()).toBe(1);
  return intents.lookup(0, PDFDict);
}

describe("applyPdfXOutputIntent", () => {
  it("embute um output intent GTS_PDFX apontando para o perfil ICC", async () => {
    const document = await buildDocument();
    applyPdfXOutputIntent(document, FAKE_ICC_PROFILE, "Meu Livro", "Livro Studio 1.0.0");
    const reloaded = await roundTrip(document);

    const intent = firstOutputIntent(reloaded);
    expect(intent.lookup(PDFName.of("Type"), PDFName).asString()).toBe("/OutputIntent");
    expect(intent.lookup(PDFName.of("S"), PDFName).asString()).toBe("/GTS_PDFX");
    expect(intent.has(PDFName.of("DestOutputProfile"))).toBe(true);
  });

  it("o perfil ICC embutido é recuperável e idêntico ao original após salvar/recarregar", async () => {
    const document = await buildDocument();
    applyPdfXOutputIntent(document, FAKE_ICC_PROFILE, "Meu Livro", "Livro Studio 1.0.0");
    const reloaded = await roundTrip(document);

    const intent = firstOutputIntent(reloaded);
    const profileStream = intent.lookup(PDFName.of("DestOutputProfile"), PDFStream) as PDFRawStream;
    expect(profileStream.dict.lookup(PDFName.of("N"), PDFNumber).asNumber()).toBe(3);
    const decoded = zlib.inflateSync(profileStream.contents);
    expect(new Uint8Array(decoded)).toEqual(FAKE_ICC_PROFILE);
  });

  it("declara a versão PDF/X-4 nos metadados XMP e inclui o título no pacote", async () => {
    const document = await buildDocument();
    applyPdfXOutputIntent(document, FAKE_ICC_PROFILE, "Título Único 42", "Livro Studio 1.0.0");
    const reloaded = await roundTrip(document);

    const metadataStream = reloaded.catalog.lookup(PDFName.of("Metadata"), PDFStream) as PDFRawStream;
    const xmp = Buffer.from(metadataStream.contents).toString("utf8");

    expect(xmp).toContain("PDF/X-4");
    expect(xmp).toContain("Título Único 42");
    expect(xmp).toContain("Livro Studio 1.0.0");
  });

  it("grava um identificador de arquivo (/ID) único no trailer por documento", async () => {
    const documentA = await buildDocument();
    applyPdfXOutputIntent(documentA, FAKE_ICC_PROFILE, "A", "Livro Studio 1.0.0");
    const documentB = await buildDocument();
    applyPdfXOutputIntent(documentB, FAKE_ICC_PROFILE, "B", "Livro Studio 1.0.0");

    const idA = documentA.context.trailerInfo.ID;
    const idB = documentB.context.trailerInfo.ID;
    expect(idA).toBeDefined();
    expect(idB).toBeDefined();
    expect(idA?.toString()).not.toBe(idB?.toString());
  });
});
