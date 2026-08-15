import { pageSide, type PageSide } from "../domain/pageGeometry";

export interface SpreadPage {
  physicalIndex: number;
  slot: PageSide;
}

export interface Spread {
  label: string;
  pages: SpreadPage[];
}

export function createSpreads(pageCount: number): Spread[] {
  if (pageCount <= 0) return [];
  const spreads: Spread[] = [{
    label: "PÁGINA 01",
    pages: [{ physicalIndex: 0, slot: "right" }],
  }];
  for (let physicalIndex = 1; physicalIndex < pageCount; physicalIndex += 2) {
    const indexes = physicalIndex + 1 < pageCount
      ? [physicalIndex, physicalIndex + 1]
      : [physicalIndex];
    spreads.push({
      label: indexes.length === 2
        ? `SPREAD ${String(indexes[0] + 1).padStart(2, "0")}–${String(indexes[1] + 1).padStart(2, "0")}`
        : `PÁGINA ${String(indexes[0] + 1).padStart(2, "0")}`,
      pages: indexes.map((index) => ({ physicalIndex: index, slot: pageSide(index) })),
    });
  }
  return spreads;
}
