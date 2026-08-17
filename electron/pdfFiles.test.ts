import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdtemp,
  readFile,
  readdir,
  rename as mockedRename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writePdfFileAtomic } from "./pdfFiles";

const renameControl = vi.hoisted(() => ({ mock: vi.fn() }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  renameControl.mock.mockImplementation(actual.rename);
  return { ...actual, rename: renameControl.mock };
});

function offset(value: number): string {
  return String(value).padStart(10, "0");
}

function createPdf(label = "Livro Studio"): Buffer {
  const header = "%PDF-1.7\n";
  const object1 = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const object2 = `2 0 obj\n<< /Type /Pages /Kids [] /Count 0 /Label (${label}) >>\nendobj\n`;
  const object1Offset = Buffer.byteLength(header);
  const object2Offset = object1Offset + Buffer.byteLength(object1);
  const xrefOffset = object2Offset + Buffer.byteLength(object2);
  return Buffer.from(
    header + object1 + object2 +
      "xref\n0 3\n" +
      "0000000000 65535 f \n" +
      `${offset(object1Offset)} 00000 n \n` +
      `${offset(object2Offset)} 00000 n \n` +
      "trailer\n<< /Size 3 /Root 1 0 R >>\n" +
      `startxref\n${xrefOffset}\n%%EOF\n`,
    "ascii",
  );
}

function systemError(code: string, message: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code });
}

describe("writePdfFileAtomic", () => {
  let directory: string;

  beforeEach(async () => {
    renameControl.mock.mockClear();
    directory = await mkdtemp(path.join(os.tmpdir(), "livro-studio-pdf-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("grava um PDF válido sem deixar arquivos temporários", async () => {
    const destination = path.join(directory, "livro.pdf");
    const pdf = createPdf();

    await writePdfFileAtomic(destination, pdf);

    expect(await readFile(destination)).toEqual(pdf);
    expect(await readdir(directory)).toEqual(["livro.pdf"]);
  });

  it("rejeita conteúdo incompleto antes de alterar um destino existente", async () => {
    const destination = path.join(directory, "livro.pdf");
    await writeFile(destination, "arquivo anterior", "utf8");

    await expect(writePdfFileAtomic(
      destination,
      Buffer.from("%PDF-1.7\nconteúdo parcial sem trailer nem referência final", "utf8"),
    )).rejects.toThrow(/trailer PDF completo/);

    expect(await readFile(destination, "utf8")).toBe("arquivo anterior");
    expect(await readdir(directory)).toEqual(["livro.pdf"]);
  });

  it("substitui atomicamente um PDF existente", async () => {
    const destination = path.join(directory, "livro.pdf");
    const previous = createPdf("Anterior");
    const next = createPdf("Atualizado");
    await writeFile(destination, previous);

    await writePdfFileAtomic(destination, next);

    expect(await readFile(destination)).toEqual(next);
    expect(await readdir(directory)).toEqual(["livro.pdf"]);
  });

  it("restaura o arquivo anterior e limpa temporários quando o fallback falha", async () => {
    const destination = path.join(directory, "livro.pdf");
    const previous = createPdf("Anterior");
    await writeFile(destination, previous);

    const actualRename = renameControl.mock.getMockImplementation();
    if (!actualRename) throw new Error("Mock de rename não inicializado.");
    let destinationInstallAttempt = 0;
    renameControl.mock.mockImplementation(async (from, to) => {
      if (path.resolve(String(to)) === path.resolve(destination)) {
        destinationInstallAttempt += 1;
        if (destinationInstallAttempt === 1) {
          throw systemError("EPERM", "Substituição direta recusada.");
        }
        if (destinationInstallAttempt === 2 && String(from).endsWith(".tmp")) {
          throw systemError("EIO", "Falha ao instalar o temporário.");
        }
      }
      return actualRename(from, to);
    });

    await expect(writePdfFileAtomic(destination, createPdf("Novo")))
      .rejects.toThrow("Falha ao instalar o temporário.");

    expect(await readFile(destination)).toEqual(previous);
    expect(await readdir(directory)).toEqual(["livro.pdf"]);
  });
});
