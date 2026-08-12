import { readFile, writeFile } from "node:fs/promises";

export async function readDocumentFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

export async function writeDocumentFile(
  filePath: string,
  content: string,
): Promise<void> {
  await writeFile(filePath, content, "utf8");
}
