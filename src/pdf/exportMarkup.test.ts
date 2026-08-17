import { describe, expect, it } from "vitest";
import {
  deduplicatePdfImageDataUrls,
  serializePdfExportSurface,
} from "./exportMarkup";

describe("serialização dos assets do PDF", () => {
  it("desduplica a mesma imagem entre páginas e lotes e remove todos os data URLs", () => {
    const pngData = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    const jpegData = "/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==";
    const webpData = "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==";
    const pngUrl = `data:image/png;base64,${pngData}`;
    const jpegUrl = `data:image/jpeg;base64,${jpegData}`;
    const webpUrl = `data:image/webp;base64,${webpData}`;

    const result = deduplicatePdfImageDataUrls([
      `<section data-lote="1"><article><img alt="png" src="${pngUrl}">`
        + `<img src='${jpegUrl}' alt="jpeg"></article>`
        + `<article><img class="repetida-no-lote" src="${pngUrl}"></article></section>`,
      `<section data-lote="2"><article><img class="repetida" src='${pngUrl}'>`
        + `<img src="${webpUrl}"></article></section>`,
    ]);

    expect(result.assets).toEqual([
      { fileName: "asset-1.png", mimeType: "image/png", data: pngData },
      { fileName: "asset-2.jpg", mimeType: "image/jpeg", data: jpegData },
      { fileName: "asset-3.webp", mimeType: "image/webp", data: webpData },
    ]);
    expect(result.htmlChunks[0]).toContain('src="./assets/asset-1.png"');
    expect(result.htmlChunks[0]).toContain("src='./assets/asset-2.jpg'");
    expect(result.htmlChunks[1]).toContain("src='./assets/asset-1.png'");
    expect(result.htmlChunks[1]).toContain('src="./assets/asset-3.webp"');
    expect(result.htmlChunks.join("\n")).not.toMatch(
      /data:image\/(?:png|jpeg|webp);base64,/i,
    );
    expect(result.htmlChunks.join("\n").match(/\.\/assets\/asset-1\.png/g)).toHaveLength(3);
  });

  it("limita a configuração de páginas por lote ao teto aceito pelo main", () => {
    const emptyRoot = {
      querySelectorAll: () => [],
    } as unknown as HTMLElement;

    expect(() => serializePdfExportSurface(emptyRoot, 25)).toThrow(
      "A superfície editorial não contém páginas para exportar.",
    );
    expect(() => serializePdfExportSurface(emptyRoot, 26)).toThrow(
      "O tamanho do lote de páginas PDF é inválido.",
    );
  });
});
