import { hyphenateSync } from "hyphen/pt";

const SOFT_HYPHEN = String.fromCharCode(0x00ad);

/** Mínimo de caracteres exigido de cada lado de uma quebra hifenizada. */
export const MIN_CHARS_BEFORE_BREAK = 2;
export const MIN_CHARS_AFTER_BREAK = 2;

const breakOffsetsCache = new Map<string, readonly number[]>();

/**
 * Offsets dentro de `word` (1..word.length-1) onde é tipograficamente válido
 * inserir uma quebra hifenizada, respeitando um mínimo de caracteres de cada
 * lado. Usa os padrões de hifenização de português (algoritmo de Liang/TeX
 * via o pacote `hyphen`), determinístico e independente do medidor de texto.
 */
export function hyphenationBreakOffsets(word: string): readonly number[] {
  if (word.length < MIN_CHARS_BEFORE_BREAK + MIN_CHARS_AFTER_BREAK) return [];
  const cached = breakOffsetsCache.get(word);
  if (cached) return cached;

  const hyphenated = hyphenateSync(word, {
    minWordLength: MIN_CHARS_BEFORE_BREAK + MIN_CHARS_AFTER_BREAK,
  });
  const offsets: number[] = [];
  let plainIndex = 0;
  for (const character of hyphenated) {
    if (character === SOFT_HYPHEN) {
      if (
        plainIndex >= MIN_CHARS_BEFORE_BREAK
        && word.length - plainIndex >= MIN_CHARS_AFTER_BREAK
      ) {
        offsets.push(plainIndex);
      }
      continue;
    }
    plainIndex += 1;
  }
  breakOffsetsCache.set(word, offsets);
  return offsets;
}
