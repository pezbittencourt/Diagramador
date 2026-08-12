import { describe, expect, it } from "vitest";
import { createDefaultPageSetup } from "./defaultDocument";
import { isValidPageSetup, pageSide, resolveFacingEdges } from "./pageGeometry";

const values = { top: 10, bottom: 11, inner: 20, outer: 15 };

describe("geometria de páginas opostas", () => {
  it("considera índices pares páginas à direita", () => {
    expect(pageSide(0)).toBe("right");
    expect(pageSide(1)).toBe("left");
  });

  it("espelha as bordas interna e externa", () => {
    expect(resolveFacingEdges(values, 1, true)).toEqual({ top: 10, right: 20, bottom: 11, left: 15 });
    expect(resolveFacingEdges(values, 2, true)).toEqual({ top: 10, right: 15, bottom: 11, left: 20 });
  });

  it("rejeita margens negativas ou que não cabem na página", () => {
    const setup = createDefaultPageSetup();
    expect(isValidPageSetup(setup)).toBe(true);
    expect(isValidPageSetup({ ...setup, margins: { ...setup.margins, top: -1 } })).toBe(false);
    expect(isValidPageSetup({ ...setup, margins: { ...setup.margins, inner: 140 } })).toBe(false);
  });
});
