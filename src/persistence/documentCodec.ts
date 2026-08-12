import type { BookDocument } from "../domain/document";

export function serializeDocument(document: BookDocument): string {
  return JSON.stringify(document, null, 2);
}

export function parseDocument(source: string): BookDocument {
  const candidate: unknown = JSON.parse(source);
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !("schemaVersion" in candidate) ||
    candidate.schemaVersion !== 1
  ) {
    throw new Error("Formato de documento ausente ou incompatível.");
  }
  return candidate as BookDocument;
}

