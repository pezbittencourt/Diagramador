import { describe, expect, it } from "vitest";
import { hyphenationBreakOffsets } from "./hyphenation";

function applyOffsets(word: string, offsets: readonly number[]): string {
  const parts: string[] = [];
  let previous = 0;
  for (const offset of offsets) {
    parts.push(word.slice(previous, offset));
    previous = offset;
  }
  parts.push(word.slice(previous));
  return parts.join("-");
}

describe("hyphenationBreakOffsets", () => {
  it("encontra pontos válidos em palavras longas do português", () => {
    expect(applyOffsets("paginação", hyphenationBreakOffsets("paginação"))).toBe("pa-gi-na-ção");
    expect(applyOffsets("desenvolvimento", hyphenationBreakOffsets("desenvolvimento")))
      .toBe("de-sen-vol-vi-men-to");
  });

  it("não hifeniza palavras curtas demais para uma quebra válida", () => {
    expect(hyphenationBreakOffsets("sol")).toEqual([]);
    expect(hyphenationBreakOffsets("a")).toEqual([]);
    expect(hyphenationBreakOffsets("são")).toEqual([]);
  });

  it("respeita o mínimo de caracteres de cada lado da quebra", () => {
    const offsets = hyphenationBreakOffsets("paginação");
    for (const offset of offsets) {
      expect(offset).toBeGreaterThanOrEqual(2);
      expect("paginação".length - offset).toBeGreaterThanOrEqual(2);
    }
  });

  it("é determinístico e cacheável entre chamadas repetidas", () => {
    const first = hyphenationBreakOffsets("tipografia");
    const second = hyphenationBreakOffsets("tipografia");
    expect(first).toEqual(second);
  });
});
