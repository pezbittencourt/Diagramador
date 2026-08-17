export interface SerializedPdfAsset {
  fileName: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  data: string;
}

export interface SerializedPdfExportSurface {
  cssText: string;
  htmlChunks: string[];
  assets: SerializedPdfAsset[];
}

export const PDF_EXPORT_CHUNK_PAGE_LIMIT = 20;
const PDF_EXPORT_MAX_CHUNK_PAGE_LIMIT = 25;
type PdfAssetRegistry = Map<string, SerializedPdfAsset>;

const PDF_IMAGE_SOURCE_PATTERN = /(<img\b[^>]*?)(\s+src\s*=\s*)(["'])(data:image\/(png|jpeg|webp);base64,([^"'\s>]+))\3/gi;
const PDF_IMAGE_SOURCE_REMAINS = /<img\b[^>]*?\s+src\s*=\s*["']data:image\/(?:png|jpeg|webp);base64,/i;
const PDF_IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpeg|webp);base64,([^\s]+)$/i;

function assetExtension(mimeType: SerializedPdfAsset["mimeType"]): string {
  if (mimeType === "image/jpeg") return "jpg";
  return mimeType.slice("image/".length);
}

function registerPdfAsset(
  assetsByDataUrl: PdfAssetRegistry,
  dataUrl: string,
  subtype: string,
  data: string,
): SerializedPdfAsset {
  let asset = assetsByDataUrl.get(dataUrl);
  if (asset) return asset;
  const mimeType = `image/${subtype.toLowerCase()}` as SerializedPdfAsset["mimeType"];
  asset = {
    fileName: `asset-${assetsByDataUrl.size + 1}.${assetExtension(mimeType)}`,
    mimeType,
    data,
  };
  assetsByDataUrl.set(dataUrl, asset);
  return asset;
}

function clonePdfNodeForSerialization(node: Node, assetsByDataUrl: PdfAssetRegistry): Node {
  if (node instanceof Element && node.tagName === "IMG") {
    const imageClone = node.ownerDocument.createElement("img");
    for (const attribute of node.attributes) {
      if (attribute.name.toLowerCase() !== "src") {
        imageClone.setAttribute(attribute.name, attribute.value);
      }
    }
    const source = node.getAttribute("src") ?? "";
    if (source.toLowerCase().startsWith("data:image/")) {
      const match = PDF_IMAGE_DATA_URL_PATTERN.exec(source);
      if (!match) {
        throw new Error("Uma imagem incorporada n\u00e3o p\u00f4de ser separada dos lotes HTML do PDF.");
      }
      const asset = registerPdfAsset(assetsByDataUrl, source, match[1], match[2]);
      imageClone.setAttribute("src", `./assets/${asset.fileName}`);
    } else if (source) {
      imageClone.setAttribute("src", source);
    }
    return imageClone;
  }

  const clone = node.cloneNode(false);
  for (const child of node.childNodes) {
    clone.appendChild(clonePdfNodeForSerialization(child, assetsByDataUrl));
  }
  return clone;
}

/**
 * Extrai imagens incorporadas dos clones HTML. O mapa vive por toda a lista de
 * lotes para que uma imagem repetida nunca atravesse o IPC mais de uma vez.
 */
export function deduplicatePdfImageDataUrls(
  sourceChunks: readonly string[],
): Pick<SerializedPdfExportSurface, "htmlChunks" | "assets"> {
  const assetsByDataUrl: PdfAssetRegistry = new Map();
  const htmlChunks = sourceChunks.map((html) => rewritePdfImageDataUrls(html, assetsByDataUrl));
  return { htmlChunks, assets: [...assetsByDataUrl.values()] };
}

function rewritePdfImageDataUrls(html: string, assetsByDataUrl: PdfAssetRegistry): string {
  const rewritten = html.replace(
    PDF_IMAGE_SOURCE_PATTERN,
    (
      _match,
      tagStart: string,
      sourceAttribute: string,
      quote: string,
      dataUrl: string,
      subtype: string,
      data: string,
    ) => {
      const asset = registerPdfAsset(assetsByDataUrl, dataUrl, subtype, data);
      return `${tagStart}${sourceAttribute}${quote}./assets/${asset.fileName}${quote}`;
    },
  );

  if (PDF_IMAGE_SOURCE_REMAINS.test(rewritten)) {
    throw new Error("Uma imagem incorporada não pôde ser separada dos lotes HTML do PDF.");
  }
  return rewritten;
}

function readableStyleSheetText(root: HTMLElement): string {
  const chunks: string[] = [];
  for (const sheet of document.styleSheets) {
    if (sheet.ownerNode && root.contains(sheet.ownerNode)) continue;
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      throw new Error("Não foi possível copiar uma folha de estilos para o renderer dedicado do PDF.");
    }
    chunks.push([...rules].map((rule) => rule.cssText).join("\n"));
  }
  const cssText = chunks.filter(Boolean).join("\n");
  if (!cssText.trim()) {
    throw new Error("A folha de estilos editorial não está disponível para a exportação PDF.");
  }
  return cssText;
}

/**
 * Serializa somente a projeção editorial. Cada fragmento contém poucas páginas
 * para que o Chromium nunca precise materializar um livro longo numa única
 * operação de impressão.
 */
export function serializePdfExportSurface(
  root: HTMLElement,
  pageLimit = PDF_EXPORT_CHUNK_PAGE_LIMIT,
): SerializedPdfExportSurface {
  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > PDF_EXPORT_MAX_CHUNK_PAGE_LIMIT) {
    throw new Error("O tamanho do lote de páginas PDF é inválido.");
  }
  const pages = [...root.querySelectorAll<HTMLElement>(":scope > .pdf-export-page")];
  if (!pages.length) throw new Error("A superfície editorial não contém páginas para exportar.");

  const sharedChildren = [...root.children]
    .filter((child) => child.tagName === "STYLE");
  const assetsByDataUrl: PdfAssetRegistry = new Map();
  const htmlChunks: string[] = [];
  for (let from = 0; from < pages.length; from += pageLimit) {
    const selected = pages.slice(from, from + pageLimit);
    const chunkRoot = root.cloneNode(false) as HTMLElement;
    chunkRoot.dataset.pageCount = String(selected.length);
    for (const child of sharedChildren) chunkRoot.appendChild(child.cloneNode(true));
    for (const page of selected) {
      const pageClone = clonePdfNodeForSerialization(page, assetsByDataUrl) as HTMLElement;
      chunkRoot.appendChild(pageClone);
    }
    const html = chunkRoot.outerHTML;
    if (PDF_IMAGE_SOURCE_REMAINS.test(html)) {
      throw new Error("Uma imagem incorporada n\u00e3o p\u00f4de ser separada dos lotes HTML do PDF.");
    }
    htmlChunks.push(html);
  }

  return {
    cssText: readableStyleSheetText(root),
    htmlChunks,
    assets: [...assetsByDataUrl.values()],
  };
}
