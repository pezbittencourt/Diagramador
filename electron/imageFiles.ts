import { readFile } from "node:fs/promises";
import path from "node:path";

export type SupportedImageMime = "image/png" | "image/jpeg" | "image/webp";

export interface ImportedImageFile {
  fileName: string;
  mimeType: SupportedImageMime;
  data: string;
}

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

function detectMimeType(buffer: Buffer): SupportedImageMime | undefined {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return undefined;
}

export async function importImageFile(filePath: string): Promise<ImportedImageFile> {
  const buffer = await readFile(filePath);
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("A imagem excede o limite de 50 MB.");
  const mimeType = detectMimeType(buffer);
  if (!mimeType) throw new Error("Formato de imagem inválido. Use PNG, JPEG ou WebP.");
  return {
    fileName: path.basename(filePath),
    mimeType,
    data: buffer.toString("base64"),
  };
}
