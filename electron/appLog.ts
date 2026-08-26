import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

let logDirectory: string | undefined;
let logQueue = Promise.resolve();
const MAX_LOG_BYTES = 2 * 1024 * 1024;

export function configureLogging(userDataPath: string): void {
  logDirectory = path.join(userDataPath, "logs");
}

function safeError(error: unknown) {
  if (error instanceof Error) return {
    name: error.name,
    message: error.message.slice(0, 2000),
    stack: error.stack?.slice(0, 8000),
  };
  return { name: "UnknownError", message: String(error).slice(0, 2000) };
}

async function appendLogEntry(category: string, error: unknown, detail?: Record<string, unknown>): Promise<void> {
  if (!logDirectory) return;
  try {
    await mkdir(logDirectory, { recursive: true });
    const current = path.join(logDirectory, "livro-studio.log");
    try {
      if ((await stat(current)).size >= MAX_LOG_BYTES) {
        const first = path.join(logDirectory, "livro-studio.log.1");
        const second = path.join(logDirectory, "livro-studio.log.2");
        await rm(second, { force: true });
        try { await rename(first, second); } catch { /* primeira rotação */ }
        await rename(current, first);
      }
    } catch { /* arquivo ainda não existe */ }
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      category: category.slice(0, 80),
      error: safeError(error),
      ...(detail ? { detail } : {}),
    });
    await appendFile(current, `${entry}\n`, "utf8");
  } catch {
    // Logging nunca deve derrubar a aplicação nem criar loop de exceções.
  }
}

export function logError(category: string, error: unknown, detail?: Record<string, unknown>): Promise<void> {
  logQueue = logQueue.then(() => appendLogEntry(category, error, detail));
  return logQueue;
}
