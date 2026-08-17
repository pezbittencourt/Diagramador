const RANGE_SEPARATOR = "[-\u2013\u2014]";

function assertValidTotalPages(totalPages: number): void {
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    throw new Error("A quantidade total de páginas físicas deve ser um inteiro positivo.");
  }
}

function assertPageWithinDocument(page: number, totalPages: number): void {
  if (page < 1) {
    throw new Error("A página física 0 não é válida. A numeração começa em 1.");
  }

  if (page > totalPages) {
    throw new Error(
      `A página física ${page} está fora do documento, que possui ${totalPages} página(s).`,
    );
  }
}

/**
 * Converte uma seleção de páginas físicas, como `1-10, 15, 20–25`, em índices
 * físicos zero-based. Intervalos sobrepostos e páginas repetidas são
 * normalizados para uma lista única em ordem crescente.
 */
export function parsePhysicalPageRange(input: string, totalPages: number): number[] {
  assertValidTotalPages(totalPages);

  const normalizedInput = input.trim();
  if (!normalizedInput) {
    throw new Error("Informe ao menos uma página física para exportar.");
  }

  const pages = new Set<number>();
  const tokens = normalizedInput.split(",");
  const intervalPattern = new RegExp(`^(\\d+)\\s*${RANGE_SEPARATOR}\\s*(\\d+)$`);

  for (const rawToken of tokens) {
    const token = rawToken.trim();
    if (!token) {
      throw new Error("O intervalo de páginas físicas contém um item vazio.");
    }

    if (/^\d+$/.test(token)) {
      const page = Number(token);
      assertPageWithinDocument(page, totalPages);
      pages.add(page - 1);
      continue;
    }

    const interval = intervalPattern.exec(token);
    if (!interval) {
      throw new Error(`O item "${token}" não é um número ou intervalo de páginas válido.`);
    }

    const start = Number(interval[1]);
    const end = Number(interval[2]);
    assertPageWithinDocument(start, totalPages);
    assertPageWithinDocument(end, totalPages);

    if (start > end) {
      throw new Error(`O intervalo de páginas físicas ${start}–${end} está invertido.`);
    }

    for (let page = start; page <= end; page += 1) {
      pages.add(page - 1);
    }
  }

  return [...pages].sort((left, right) => left - right);
}
