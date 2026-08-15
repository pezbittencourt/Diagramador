import { describe, expect, it } from "vitest";
import { createSpreads } from "./spreads";

describe("spreads editoriais dinâmicos", () => {
  it("mantém a página 1 isolada e agrupa pares à esquerda com ímpares à direita", () => {
    expect(createSpreads(7).map((spread) => spread.pages)).toEqual([
      [{ physicalIndex: 0, slot: "right" }],
      [{ physicalIndex: 1, slot: "left" }, { physicalIndex: 2, slot: "right" }],
      [{ physicalIndex: 3, slot: "left" }, { physicalIndex: 4, slot: "right" }],
      [{ physicalIndex: 5, slot: "left" }, { physicalIndex: 6, slot: "right" }],
    ]);
  });

  it("deixa uma última página par na coluna esquerda após reflow", () => {
    expect(createSpreads(4).at(-1)?.pages).toEqual([
      { physicalIndex: 3, slot: "left" },
    ]);
  });
});
