import {
  lstat,
  open,
  rename,
  rm,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const PDF_HEADER = /^%PDF-(?:1\.[0-9]|2\.0)(?:\r\n|\r|\n)/;
const PDF_EOF_MARKER = Buffer.from("%%EOF", "ascii");
const MAX_TRAILER_SEARCH_BYTES = 4096;
const REPLACE_CONFLICT_CODES = new Set(["EACCES", "EEXIST", "EPERM"]);

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as NodeJS.ErrnoException).code)
    : undefined;
}

function validatePdfBuffer(buffer: Buffer): void {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) {
    throw new Error("O conteúdo gerado não é um PDF válido.");
  }

  const header = buffer.subarray(0, Math.min(buffer.length, 16)).toString("ascii");
  if (!PDF_HEADER.test(header)) {
    throw new Error("O conteúdo gerado não possui um cabeçalho PDF válido.");
  }

  const eofOffset = buffer.lastIndexOf(PDF_EOF_MARKER);
  if (eofOffset < 0 || buffer.length - eofOffset > MAX_TRAILER_SEARCH_BYTES) {
    throw new Error("O conteúdo gerado não possui um trailer PDF completo.");
  }

  const trailingBytes = buffer.subarray(eofOffset + PDF_EOF_MARKER.length);
  if (!/^[\x00\x09\x0a\x0c\x0d\x20]*$/.test(trailingBytes.toString("latin1"))) {
    throw new Error("O conteúdo gerado possui dados inesperados após o fim do PDF.");
  }

  const trailerStart = Math.max(0, eofOffset - 128);
  const trailer = buffer.subarray(trailerStart, eofOffset).toString("ascii");
  const startXref = /startxref\s+(\d+)\s*$/.exec(trailer);
  const xrefOffset = startXref ? Number(startXref[1]) : Number.NaN;
  if (!Number.isSafeInteger(xrefOffset) || xrefOffset < 0 || xrefOffset >= eofOffset) {
    throw new Error("O conteúdo gerado possui uma referência final PDF inválida.");
  }
}

/**
 * Conta objetos de página no PDF produzido pelo Chromium. A árvore de páginas
 * (`/Pages`) não é contada por causa do limite de palavra após `/Page`.
 */
export function countPdfPages(buffer: Buffer): number {
  validatePdfBuffer(buffer);
  const matches = buffer.toString("latin1").match(/\/Type\s*\/Page\b/g);
  const count = matches?.length ?? 0;
  if (!count) throw new Error("O PDF gerado não contém nenhuma página reconhecível.");
  return count;
}

async function destinationCanBeBackedUp(filePath: string): Promise<boolean> {
  try {
    const stats = await lstat(filePath);
    return stats.isFile() || stats.isSymbolicLink();
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

async function createExclusiveTemporaryFile(
  directory: string,
  destinationName: string,
): Promise<{ filePath: string; handle: FileHandle }> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const filePath = path.join(
      directory,
      `.${destinationName}.${process.pid}.${randomUUID()}.tmp`,
    );
    try {
      return { filePath, handle: await open(filePath, "wx", 0o666) };
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
    }
  }
  throw new Error("Não foi possível reservar um arquivo temporário exclusivo para o PDF.");
}

async function replaceWithRollback(
  temporaryPath: string,
  destinationPath: string,
  initialError: unknown,
): Promise<void> {
  if (!REPLACE_CONFLICT_CODES.has(errorCode(initialError) ?? "") ||
      !(await destinationCanBeBackedUp(destinationPath))) {
    throw initialError;
  }

  const backupPath = path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}.${process.pid}.${randomUUID()}.backup`,
  );
  let backupCreated = false;

  try {
    await rename(destinationPath, backupPath);
    backupCreated = true;

    try {
      await rename(temporaryPath, destinationPath);
    } catch (replacementError) {
      try {
        await rename(backupPath, destinationPath);
        backupCreated = false;
      } catch (rollbackError) {
        throw new AggregateError(
          [replacementError, rollbackError],
          `Não foi possível substituir o PDF nem restaurar o arquivo anterior. ` +
            `A cópia anterior permanece em ${backupPath}.`,
        );
      }
      throw replacementError;
    }

    // A substituição já foi concluída. Uma falha ao apagar a cópia anterior não
    // deve transformar uma exportação válida em erro nem remover o PDF novo.
    try {
      await rm(backupPath, { force: true });
      backupCreated = false;
    } catch {
      // O backup tem nome exclusivo e pode ser removido em uma limpeza futura.
    }
  } catch (error) {
    if (backupCreated) {
      try {
        await rename(backupPath, destinationPath);
        backupCreated = false;
      } catch (rollbackError) {
        if (error instanceof AggregateError) throw error;
        throw new AggregateError(
          [error, rollbackError],
          `A gravação do PDF falhou e o arquivo anterior não pôde ser restaurado. ` +
            `A cópia anterior permanece em ${backupPath}.`,
        );
      }
    }
    throw error;
  }
}

async function commitTemporaryFile(
  temporaryPath: string,
  destinationPath: string,
): Promise<void> {
  try {
    // No POSIX e nas versões atuais do Node para Windows, rename substitui um
    // arquivo existente sem expor conteúdo parcial. O fallback abaixo cobre
    // filesystems/antivírus que recusam essa substituição direta no Windows.
    await rename(temporaryPath, destinationPath);
  } catch (error) {
    await replaceWithRollback(temporaryPath, destinationPath, error);
  }
}

/**
 * Valida e grava um PDF sem expor um arquivo parcial no caminho final.
 *
 * O temporário é exclusivo, fica no mesmo diretório do destino e é sincronizado
 * antes do rename. Se uma substituição direta for recusada, o arquivo anterior
 * é movido para um backup exclusivo e restaurado caso o segundo rename falhe.
 */
export async function writePdfFileAtomic(
  filePath: string,
  buffer: Buffer,
): Promise<void> {
  validatePdfBuffer(buffer);

  const destinationPath = path.resolve(filePath);
  const directory = path.dirname(destinationPath);
  const destinationName = path.basename(destinationPath);
  if (!destinationName || destinationName === "." || destinationName === "..") {
    throw new Error("O caminho de destino do PDF é inválido.");
  }

  const temporary = await createExclusiveTemporaryFile(directory, destinationName);
  let handle: FileHandle | undefined = temporary.handle;
  let committed = false;

  try {
    await handle.writeFile(buffer);
    await handle.sync();
    await handle.close();
    handle = undefined;

    await commitTemporaryFile(temporary.filePath, destinationPath);
    committed = true;
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // A remoção abaixo ainda é tentada; o erro principal permanece intacto.
      }
    }
    if (!committed) {
      try {
        await rm(temporary.filePath, { force: true });
      } catch {
        // Nunca removemos o destino para limpar um temporário que falhou.
      }
    }
  }
}
