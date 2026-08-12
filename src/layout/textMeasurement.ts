import type { ParagraphStyle } from "../domain/document";

export interface TextMeasurer {
  measure(text: string, style: ParagraphStyle): number;
}

export class CanvasTextMeasurer implements TextMeasurer {
  private readonly context: CanvasRenderingContext2D;

  constructor() {
    const context = globalThis.document?.createElement("canvas").getContext("2d");
    if (!context) throw new Error("O navegador não disponibilizou medição tipográfica.");
    this.context = context;
  }

  measure(text: string, style: ParagraphStyle): number {
    this.context.font = `${style.fontSizePt}pt ${style.fontFamily}`;
    return this.context.measureText(text).width * 25.4 / 96;
  }
}

/** Medidor estável para testes de domínio, sem dependência do DOM. */
export class DeterministicTextMeasurer implements TextMeasurer {
  measure(text: string, style: ParagraphStyle): number {
    const averageGlyphMm = style.fontSizePt * 25.4 / 72 * 0.52;
    return [...text].reduce(
      (width, character) => width + averageGlyphMm * (character === " " ? 0.52 : 1),
      0,
    );
  }
}
