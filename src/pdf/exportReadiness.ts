import type { LayoutSnapshot } from "../layout/layoutTypes";

export interface ExportFontRequest {
  family: string;
  fontWeight: number;
  italic: boolean;
}

const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
]);

const FONT_READY_TIMEOUT_MS = 15_000;
const FONT_PROBE_TIMEOUT_MS = 20_000;
const EXPORT_SURFACE_TIMEOUT_MS = 5_000;

async function withDeadline<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve(operation), timeout]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

function primaryFontFamily(fontFamily: string): string {
  return fontFamily.split(",")[0]?.trim().replace(/^['\"]|['\"]$/g, "") ?? "";
}

export function collectExportFontRequests(
  layout: LayoutSnapshot,
  physicalPageIndexes: number[],
  includeFolioFont = false,
): ExportFontRequest[] {
  const keys = new Set<string>();
  const requests: ExportFontRequest[] = [];
  const add = (request: ExportFontRequest) => {
    const family = primaryFontFamily(request.family);
    if (!family || GENERIC_FAMILIES.has(family.toLowerCase())) return;
    const normalized = { ...request, family };
    const key = `${family.toLowerCase()}|${request.fontWeight}|${request.italic}`;
    if (keys.has(key)) return;
    keys.add(key);
    requests.push(normalized);
  };

  for (const pageIndex of physicalPageIndexes) {
    const page = layout.pages[pageIndex];
    for (const fragment of page?.fragments ?? []) {
      for (const line of fragment.lines) {
        for (const run of line.runs) {
          add({
            family: run.style.fontFamily,
            fontWeight: run.style.fontWeight,
            italic: run.style.italic,
          });
        }
      }
    }
  }
  if (includeFolioFont) add({ family: "Georgia", fontWeight: 400, italic: false });
  return requests;
}

function localFontSource(family: string): string {
  return `local("${family.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}")`;
}

export async function validateExportFonts(requests: ExportFontRequest[]): Promise<void> {
  if (!globalThis.document?.fonts || typeof FontFace === "undefined") {
    throw new Error("O navegador não disponibilizou a verificação de fontes para exportação.");
  }
  await withDeadline(
    document.fonts.ready,
    FONT_READY_TIMEOUT_MS,
    "A preparação das fontes demorou além do esperado. Tente novamente após reiniciar o aplicativo.",
  );
  const unavailable: string[] = [];
  const probes = requests.map(async (request) => {
    const probeFamily = `livro-studio-pdf-probe-${crypto.randomUUID()}`;
    const face = new FontFace(probeFamily, localFontSource(request.family), {
      style: request.italic ? "italic" : "normal",
      weight: String(request.fontWeight),
    });
    try {
      await face.load();
    } catch {
      unavailable.push(`${request.family} (${request.fontWeight}${request.italic ? ", itálico" : ""})`);
    }
  });
  await withDeadline(
    Promise.all(probes),
    FONT_PROBE_TIMEOUT_MS,
    "A verificação das fontes demorou além do esperado. A exportação foi interrompida sem substituir arquivos.",
  );
  if (unavailable.length) {
    throw new Error(
      `Exportação interrompida: fonte ou variante indisponível: ${unavailable.join("; ")}. `
      + "Instale a fonte ou escolha outra família para evitar substituição silenciosa.",
    );
  }
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(fallback);
      resolve();
    };
    const fallback = window.setTimeout(finish, 100);
    requestAnimationFrame(finish);
  });
}

export async function waitForExportSurface(exportId: string): Promise<HTMLElement> {
  const selector = `[data-pdf-export-id="${CSS.escape(exportId)}"]`;
  const deadline = performance.now() + EXPORT_SURFACE_TIMEOUT_MS;
  let root: HTMLElement | null = null;
  do {
    await nextAnimationFrame();
    root = document.querySelector<HTMLElement>(selector);
  } while (!root && performance.now() < deadline);
  if (!root) throw new Error("A superfície editorial do PDF não foi montada.");
  await withDeadline(
    document.fonts.ready,
    FONT_READY_TIMEOUT_MS,
    "A preparação das fontes demorou além do esperado. A exportação foi interrompida.",
  );
  const images = [...root.querySelectorAll<HTMLImageElement>("img")];
  const decoding = Promise.all(images.map(async (image) => {
    try {
      await image.decode();
    } catch {
      throw new Error(`Não foi possível decodificar a imagem ${image.dataset.fileName ?? "incorporada"}.`);
    }
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error(`A imagem ${image.dataset.fileName ?? "incorporada"} está vazia ou corrompida.`);
    }
  }));
  await withDeadline(
    decoding,
    Math.min(120_000, 20_000 + images.length * 1_000),
    "A preparação das imagens demorou além do esperado. Verifique se algum asset está corrompido.",
  );
  return root;
}
