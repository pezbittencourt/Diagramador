import { readFile } from "node:fs/promises";
import mammoth from "mammoth";

export interface ImportedManuscript {
  filePath: string;
  fileName: string;
  format: "txt" | "docx";
  text: string;
  warnings: string[];
}

function decodeText(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buffer.subarray(2));
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length - 2);
    for (let index = 2; index + 1 < buffer.length; index += 2) {
      swapped[index - 2] = buffer[index + 1];
      swapped[index - 1] = buffer[index];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }
  return new TextDecoder("utf-8").decode(buffer);
}

export async function importManuscriptFile(filePath: string): Promise<ImportedManuscript> {
  const fileName = filePath.split(/[\\/]/).at(-1) ?? "manuscrito";
  const extension = fileName.split(".").at(-1)?.toLowerCase();

  if (extension === "txt") {
    return {
      filePath,
      fileName,
      format: "txt",
      text: decodeText(await readFile(filePath)),
      warnings: [],
    };
  }

  if (extension === "docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return {
      filePath,
      fileName,
      format: "docx",
      text: result.value,
      warnings: result.messages.map((message) => message.message),
    };
  }

  throw new Error("Formato de manuscrito não suportado. Use TXT ou DOCX.");
}
