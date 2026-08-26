import { readFile } from "node:fs/promises";
import { writeFileAtomic } from "./atomicFiles.js";

export async function readDocumentFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

export async function writeDocumentFile(
  filePath: string,
  content: string,
): Promise<void> {
  await writeFileAtomic(filePath, Buffer.from(content, "utf8"));
}
