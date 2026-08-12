import type { EdgeValues, PageSetup } from "./document";

export type PageSide = "left" | "right";

export interface PhysicalEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function pageSide(physicalIndex: number): PageSide {
  return physicalIndex % 2 === 0 ? "right" : "left";
}

export function resolveFacingEdges(
  values: EdgeValues,
  physicalIndex: number,
  mirrored: boolean,
): PhysicalEdges {
  const side = pageSide(physicalIndex);

  if (!mirrored) {
    return {
      top: values.top,
      right: values.outer,
      bottom: values.bottom,
      left: values.inner,
    };
  }

  return {
    top: values.top,
    right: side === "left" ? values.inner : values.outer,
    bottom: values.bottom,
    left: side === "left" ? values.outer : values.inner,
  };
}

export function isValidPageSetup(setup: PageSetup): boolean {
  const { width, height, margins, bleed } = setup;
  return (
    width >= 50 &&
    height >= 50 &&
    margins.inner + margins.outer < width &&
    margins.top + margins.bottom < height &&
    [...Object.values(margins), ...Object.values(bleed)].every(
      (value) => Number.isFinite(value) && value >= 0,
    )
  );
}
