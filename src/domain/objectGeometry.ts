import type {
  AssetReference,
  EdgeValues,
  Millimeters,
  PositionedImageObject,
  PositionedObject,
} from "./document";

export const PIXELS_PER_MILLIMETER = 96 / 25.4;
export const MIN_OBJECT_SIZE_MM = 1;

export function millimetersToPixels(value: Millimeters, scale = 1): number {
  return value * PIXELS_PER_MILLIMETER * scale;
}

export function pixelsToMillimeters(value: number, scale = 1): Millimeters {
  return value / (PIXELS_PER_MILLIMETER * scale);
}

export interface EmbeddedImageInput {
  fileName: string;
  mimeType: AssetReference["mimeType"];
  data: string;
  pixelWidth: number;
  pixelHeight: number;
}

export function createEmbeddedImagePlacement(
  input: EmbeddedImageInput,
  pageWidthMm: number,
  pageHeightMm: number,
): { asset: AssetReference; object: PositionedImageObject } {
  const assetId = crypto.randomUUID();
  const originalAspectRatio = input.pixelWidth / input.pixelHeight;
  const naturalWidthMm = input.pixelWidth / PIXELS_PER_MILLIMETER;
  const naturalHeightMm = input.pixelHeight / PIXELS_PER_MILLIMETER;
  const fitScale = Math.min(
    1,
    pageWidthMm * 0.65 / naturalWidthMm,
    pageHeightMm * 0.65 / naturalHeightMm,
  );
  let width = naturalWidthMm * fitScale;
  let height = naturalHeightMm * fitScale;
  if (width < MIN_OBJECT_SIZE_MM) {
    width = MIN_OBJECT_SIZE_MM;
    height = width / originalAspectRatio;
  }
  if (height < MIN_OBJECT_SIZE_MM) {
    height = MIN_OBJECT_SIZE_MM;
    width = height * originalAspectRatio;
  }
  return {
    asset: {
      id: assetId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      encoding: "base64",
      data: input.data,
      pixelWidth: input.pixelWidth,
      pixelHeight: input.pixelHeight,
    },
    object: {
      id: crypto.randomUUID(),
      type: "image",
      anchorMode: "page",
      assetId,
      x: (pageWidthMm - width) / 2,
      y: (pageHeightMm - height) / 2,
      width,
      height,
      originalAspectRatio,
      lockAspectRatio: true,
      zIndex: 0,
    },
  };
}

export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

function positive(value: number): number {
  return Math.max(MIN_OBJECT_SIZE_MM, value);
}

export function resizePositionedObject(
  object: PositionedImageObject,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
): PositionedImageObject {
  const east = handle.includes("e");
  const west = handle.includes("w");
  const north = handle.includes("n");
  const south = handle.includes("s");
  const rawWidth = positive(object.width + (east ? deltaX : west ? -deltaX : 0));
  const rawHeight = positive(object.height + (south ? deltaY : north ? -deltaY : 0));
  let width = rawWidth;
  let height = rawHeight;

  if (object.lockAspectRatio) {
    if ((east || west) && (north || south)) {
      const widthChange = Math.abs(rawWidth / object.width - 1);
      const heightChange = Math.abs(rawHeight / object.height - 1);
      if (widthChange >= heightChange) height = width / object.originalAspectRatio;
      else width = height * object.originalAspectRatio;
    } else if (east || west) {
      height = width / object.originalAspectRatio;
    } else {
      width = height * object.originalAspectRatio;
    }
  }

  return {
    ...object,
    x: west ? object.x + object.width - width : object.x,
    y: north ? object.y + object.height - height : object.y,
    width,
    height,
  };
}

export function setPositionedObjectMeasure(
  object: PositionedImageObject,
  measure: "x" | "y" | "width" | "height",
  value: number,
): PositionedImageObject {
  if (measure === "x" || measure === "y") return { ...object, [measure]: value };
  const size = positive(value);
  if (!object.lockAspectRatio) return { ...object, [measure]: size };
  return measure === "width"
    ? { ...object, width: size, height: size / object.originalAspectRatio }
    : { ...object, height: size, width: size * object.originalAspectRatio };
}

export type StackAction = "front" | "forward" | "backward" | "back";

export function reorderPositionedObjects(
  objects: PositionedObject[],
  objectId: string,
  action: StackAction,
): PositionedObject[] {
  const ordered = [...objects].sort((a, b) => a.zIndex - b.zIndex);
  const index = ordered.findIndex((object) => object.id === objectId);
  if (index < 0) return objects;
  const target = action === "front" ? ordered.length - 1
    : action === "back" ? 0
      : action === "forward" ? Math.min(ordered.length - 1, index + 1)
        : Math.max(0, index - 1);
  const [selected] = ordered.splice(index, 1);
  ordered.splice(target, 0, selected);
  return ordered.map((object, zIndex) => ({ ...object, zIndex }));
}

export interface SnapGeometry {
  pageWidth: number;
  pageHeight: number;
  margins: { top: number; right: number; bottom: number; left: number };
  bleed: { top: number; right: number; bottom: number; left: number };
  verticalGuides: number[];
  horizontalGuides: number[];
}

export interface SnapFeedback {
  vertical?: { positionMm: number; kind: string };
  horizontal?: { positionMm: number; kind: string };
}

export interface SnappedPosition {
  x: number;
  y: number;
  feedback: SnapFeedback;
}

export function keepObjectRecoverable(
  object: Pick<PositionedObject, "width" | "height">,
  x: number,
  y: number,
  geometry: Pick<SnapGeometry, "pageWidth" | "pageHeight" | "bleed">,
  minimumVisibleMm = 5,
): { x: number; y: number } {
  const visibleWidth = Math.min(minimumVisibleMm, object.width);
  const visibleHeight = Math.min(minimumVisibleMm, object.height);
  return {
    x: Math.min(
      geometry.pageWidth + geometry.bleed.right - visibleWidth,
      Math.max(-geometry.bleed.left - object.width + visibleWidth, x),
    ),
    y: Math.min(
      geometry.pageHeight + geometry.bleed.bottom - visibleHeight,
      Math.max(-geometry.bleed.top - object.height + visibleHeight, y),
    ),
  };
}

interface SnapTarget { position: number; kind: string }

function closestSnap(
  objectPoints: number[],
  targets: SnapTarget[],
  toleranceMm: number,
): { delta: number; target?: SnapTarget } {
  let best: { distance: number; delta: number; target?: SnapTarget } = {
    distance: Number.POSITIVE_INFINITY,
    delta: 0,
  };
  for (const point of objectPoints) {
    for (const target of targets) {
      const delta = target.position - point;
      const distance = Math.abs(delta);
      if (distance < best.distance) best = { distance, delta, target };
    }
  }
  return best.distance <= toleranceMm ? best : { delta: 0 };
}

export function snapObjectPosition(
  object: Pick<PositionedObject, "width" | "height">,
  desiredX: number,
  desiredY: number,
  geometry: SnapGeometry,
  scale: number,
  enabled: boolean,
  tolerancePx = 8,
): SnappedPosition {
  if (!enabled) return { x: desiredX, y: desiredY, feedback: {} };
  const xTargets: SnapTarget[] = [
    { position: -geometry.bleed.left, kind: "sangria" },
    { position: 0, kind: "borda" },
    { position: geometry.margins.left, kind: "margem" },
    { position: geometry.pageWidth / 2, kind: "centro" },
    { position: geometry.pageWidth - geometry.margins.right, kind: "margem" },
    { position: geometry.pageWidth, kind: "borda" },
    { position: geometry.pageWidth + geometry.bleed.right, kind: "sangria" },
    ...geometry.verticalGuides.map((position) => ({ position, kind: "guia" })),
  ];
  const yTargets: SnapTarget[] = [
    { position: -geometry.bleed.top, kind: "sangria" },
    { position: 0, kind: "borda" },
    { position: geometry.margins.top, kind: "margem" },
    { position: geometry.pageHeight / 2, kind: "centro" },
    { position: geometry.pageHeight - geometry.margins.bottom, kind: "margem" },
    { position: geometry.pageHeight, kind: "borda" },
    { position: geometry.pageHeight + geometry.bleed.bottom, kind: "sangria" },
    ...geometry.horizontalGuides.map((position) => ({ position, kind: "guia" })),
  ];
  const toleranceMm = pixelsToMillimeters(tolerancePx, scale);
  const xSnap = closestSnap(
    [desiredX, desiredX + object.width / 2, desiredX + object.width],
    xTargets,
    toleranceMm,
  );
  const ySnap = closestSnap(
    [desiredY, desiredY + object.height / 2, desiredY + object.height],
    yTargets,
    toleranceMm,
  );
  return {
    x: desiredX + xSnap.delta,
    y: desiredY + ySnap.delta,
    feedback: {
      ...(xSnap.target ? { vertical: { positionMm: xSnap.target.position, kind: xSnap.target.kind } } : {}),
      ...(ySnap.target ? { horizontal: { positionMm: ySnap.target.position, kind: ySnap.target.kind } } : {}),
    },
  };
}

export type PageAlignment = "left" | "horizontal-center" | "right" | "top" | "vertical-center" | "bottom";

export function alignObjectToPage<T extends PositionedObject>(
  object: T,
  alignment: PageAlignment,
  pageWidth: number,
  pageHeight: number,
): T {
  if (alignment === "left") return { ...object, x: 0 };
  if (alignment === "right") return { ...object, x: pageWidth - object.width };
  if (alignment === "horizontal-center") return { ...object, x: (pageWidth - object.width) / 2 };
  if (alignment === "top") return { ...object, y: 0 };
  if (alignment === "bottom") return { ...object, y: pageHeight - object.height };
  return { ...object, y: (pageHeight - object.height) / 2 };
}

export function facingEdgesToPhysical(
  values: EdgeValues,
  physicalIndex: number,
  mirrored: boolean,
): { top: number; right: number; bottom: number; left: number } {
  const isLeft = physicalIndex % 2 === 1;
  return {
    top: values.top,
    bottom: values.bottom,
    left: mirrored ? (isLeft ? values.outer : values.inner) : values.inner,
    right: mirrored ? (isLeft ? values.inner : values.outer) : values.outer,
  };
}
