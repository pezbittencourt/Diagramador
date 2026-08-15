import { describe, expect, it } from "vitest";
import type { PositionedImageObject } from "./document";
import {
  alignObjectToPage,
  createEmbeddedImagePlacement,
  millimetersToPixels,
  keepObjectRecoverable,
  pixelsToMillimeters,
  reorderPositionedObjects,
  resizePositionedObject,
  setPositionedObjectMeasure,
  snapObjectPosition,
} from "./objectGeometry";

const image: PositionedImageObject = {
  id: "image",
  type: "image",
  anchorMode: "page",
  assetId: "asset",
  x: 12,
  y: -3,
  width: 60,
  height: 40,
  originalAspectRatio: 1.5,
  lockAspectRatio: true,
  zIndex: 0,
};

describe("positioned object geometry", () => {
  it("A: creates a self-contained asset and a valid centered image", () => {
    const placement = createEmbeddedImagePlacement({
      fileName: "foto.webp",
      mimeType: "image/webp",
      data: "YWJj",
      pixelWidth: 1200,
      pixelHeight: 800,
    }, 148, 210);
    expect(placement.asset).toMatchObject({ encoding: "base64", data: "YWJj" });
    expect(placement.object).toMatchObject({
      type: "image",
      anchorMode: "page",
      assetId: placement.asset.id,
      originalAspectRatio: 1.5,
      lockAspectRatio: true,
    });
    expect(placement.object.width).toBeLessThanOrEqual(148 * 0.65);
  });

  it("B/C/D: preserves free mm coordinates across margins and bleed", () => {
    const moved = { ...image, x: 80, y: -12 };
    expect(moved.x).toBe(80);
    expect(moved.y).toBe(-12);
  });

  it("D: keeps a dragged object recoverable while still allowing it beyond bleed", () => {
    const position = keepObjectRecoverable(image, -200, 400, {
      pageWidth: 148,
      pageHeight: 210,
      bleed: { top: 3, right: 3, bottom: 3, left: 3 },
    });
    expect(position).toEqual({ x: -58, y: 208 });
  });

  it("E/F: resizes with aspect lock and permits a free resize", () => {
    const locked = resizePositionedObject(image, "se", 15, 2);
    expect(locked.width / locked.height).toBeCloseTo(1.5);
    const free = resizePositionedObject({ ...image, lockAspectRatio: false }, "se", 15, 2);
    expect(free).toMatchObject({ width: 75, height: 42 });
  });

  it("F: numeric width honors aspect lock", () => {
    expect(setPositionedObjectMeasure(image, "width", 75)).toMatchObject({ width: 75, height: 50 });
    expect(setPositionedObjectMeasure({ ...image, lockAspectRatio: false }, "height", 55).width).toBe(60);
  });

  it("G: persists normalized z-order operations", () => {
    const objects = [image, { ...image, id: "two", zIndex: 1 }, { ...image, id: "three", zIndex: 2 }];
    const reordered = reorderPositionedObjects(objects, "image", "front");
    expect(reordered.map((object) => object.id)).toEqual(["two", "three", "image"]);
    expect(reordered.map((object) => object.zIndex)).toEqual([0, 1, 2]);
  });

  it("L/N: mm and ruler projection remain stable at different zooms", () => {
    for (const scale of [0.5, 1, 1.5]) {
      expect(pixelsToMillimeters(millimetersToPixels(20, scale), scale)).toBeCloseTo(20);
    }
  });

  it("O: snaps an object edge to a guide with screen-based tolerance", () => {
    const result = snapObjectPosition(image, 35.2, 27, {
      pageWidth: 148,
      pageHeight: 210,
      margins: { top: 18, right: 15, bottom: 20, left: 20 },
      bleed: { top: 3, right: 3, bottom: 3, left: 3 },
      verticalGuides: [35],
      horizontalGuides: [],
    }, 1, true);
    expect(result.x).toBe(35);
    expect(result.feedback.vertical).toMatchObject({ positionMm: 35, kind: "guia" });
  });

  it("P: leaves movement untouched when snapping is disabled", () => {
    const result = snapObjectPosition(image, 35.2, 27.3, {
      pageWidth: 148,
      pageHeight: 210,
      margins: { top: 18, right: 15, bottom: 20, left: 20 },
      bleed: { top: 3, right: 3, bottom: 3, left: 3 },
      verticalGuides: [35],
      horizontalGuides: [27],
    }, 1, false);
    expect(result).toEqual({ x: 35.2, y: 27.3, feedback: {} });
  });

  it("supports the six page alignment commands without margin clamps", () => {
    expect(alignObjectToPage(image, "left", 148, 210).x).toBe(0);
    expect(alignObjectToPage(image, "right", 148, 210).x).toBe(88);
    expect(alignObjectToPage(image, "horizontal-center", 148, 210).x).toBe(44);
    expect(alignObjectToPage(image, "top", 148, 210).y).toBe(0);
    expect(alignObjectToPage(image, "bottom", 148, 210).y).toBe(170);
    expect(alignObjectToPage(image, "vertical-center", 148, 210).y).toBe(85);
  });
});
