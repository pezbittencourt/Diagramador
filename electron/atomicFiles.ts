import { lstat, open, readdir, rename, rm, stat, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const REPLACE_CONFLICT_CODES = new Set(["EACCES", "EEXIST", "EPERM"]);

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as NodeJS.ErrnoException).code)
    : undefined;
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

async function createTemporaryFile(directory: string, name: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const filePath = path.join(directory, `.${name}.${process.pid}.${randomUUID()}.tmp`);
    try {
      return { filePath, handle: await open(filePath, "wx", 0o666) };
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
    }
  }
  throw new Error("Não foi possível reservar um arquivo temporário exclusivo.");
}

async function replaceWithRollback(temporaryPath: string, destinationPath: string, initialError: unknown) {
  if (!REPLACE_CONFLICT_CODES.has(errorCode(initialError) ?? "") ||
      !(await destinationCanBeBackedUp(destinationPath))) throw initialError;
  const rollbackPath = path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}.${process.pid}.${randomUUID()}.rollback`,
  );
  let rollbackExists = false;
  try {
    await rename(destinationPath, rollbackPath);
    rollbackExists = true;
    try {
      await rename(temporaryPath, destinationPath);
    } catch (replacementError) {
      await rename(rollbackPath, destinationPath);
      rollbackExists = false;
      throw replacementError;
    }
    try {
      await rm(rollbackPath, { force: true });
      rollbackExists = false;
    } catch {
      // Uma cópia exclusiva restante é preferível a invalidar a gravação concluída.
    }
  } catch (error) {
    if (rollbackExists) {
      try {
        await rename(rollbackPath, destinationPath);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `A gravação falhou e o arquivo anterior não pôde ser restaurado. A cópia permanece em ${rollbackPath}.`,
        );
      }
    }
    throw error;
  }
}

export interface AtomicWriteOptions {
  validate?: (buffer: Buffer) => void | Promise<void>;
  beforeCommit?: (temporaryPath: string) => void | Promise<void>;
}

async function cleanupStaleTemporaryFiles(destinationPath: string): Promise<void> {
  const directory = path.dirname(destinationPath);
  const prefix = `.${path.basename(destinationPath)}.`;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let names: string[];
  try { names = await readdir(directory); } catch { return; }
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(".tmp")) continue;
    const candidate = path.join(directory, name);
    try {
      if ((await stat(candidate)).mtimeMs < cutoff) await rm(candidate, { force: true });
    } catch {
      // Arquivo pode estar em uso ou ter desaparecido; a gravação atual continua.
    }
  }
}

/** Grava no mesmo diretório, sincroniza e só então promove o temporário. */
export async function writeFileAtomic(
  filePath: string,
  buffer: Buffer,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const destinationPath = path.resolve(filePath);
  const directory = path.dirname(destinationPath);
  const name = path.basename(destinationPath);
  if (!name || name === "." || name === "..") throw new Error("O caminho de destino é inválido.");
  await options.validate?.(buffer);
  await cleanupStaleTemporaryFiles(destinationPath);
  const temporary = await createTemporaryFile(directory, name);
  let handle: FileHandle | undefined = temporary.handle;
  let committed = false;
  try {
    await handle.writeFile(buffer);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await options.beforeCommit?.(temporary.filePath);
    try {
      await rename(temporary.filePath, destinationPath);
    } catch (error) {
      await replaceWithRollback(temporary.filePath, destinationPath, error);
    }
    committed = true;
  } finally {
    if (handle) {
      try { await handle.close(); } catch { /* limpeza best-effort */ }
    }
    if (!committed) {
      try { await rm(temporary.filePath, { force: true }); } catch { /* preserva erro principal */ }
    }
  }
}
