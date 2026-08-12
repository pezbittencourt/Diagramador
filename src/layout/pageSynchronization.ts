import type { BookPage } from "../domain/document";

export function synchronizePhysicalPages(
  existing: BookPage[],
  composedPageCount: number,
): BookPage[] {
  const lastPageWithObjects = existing.reduce(
    (last, page, index) => page.objects.length ? index : last,
    -1,
  );
  const count = Math.max(1, composedPageCount, lastPageWithObjects + 1);
  return Array.from({ length: count }, (_, index) => existing[index] ?? ({
    id: crypto.randomUUID(),
    objects: [],
  }));
}
