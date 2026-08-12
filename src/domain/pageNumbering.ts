import type {
  BookPage,
  NumberingRange,
  PageNumbering,
  PageNumberFormat,
} from "./document";
import { pageSide } from "./pageGeometry";

export interface ResolvedPageNumber {
  physicalIndex: number;
  physicalNumber: number;
  logicalNumber: number | null;
  label: string | null;
  visible: boolean;
  rangeId: string | null;
}

export interface ResolvedPageNumberPlacement {
  vertical: "top" | "bottom";
  horizontal: "left" | "right" | "center";
}

function activeRange(
  ranges: NumberingRange[],
  physicalIndex: number,
): NumberingRange | undefined {
  return [...ranges]
    .sort((a, b) => b.fromPhysicalIndex - a.fromPhysicalIndex)
    .find(
      (range) =>
        physicalIndex >= range.fromPhysicalIndex &&
        (range.toPhysicalIndex === undefined ||
          physicalIndex <= range.toPhysicalIndex),
    );
}

export function formatLogicalNumber(
  value: number,
  format: PageNumberFormat,
): string {
  if (format === "arabic") return String(value);
  if (value <= 0 || value >= 4000) return String(value);

  const numerals: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let remainder = value;
  let result = "";
  for (const [number, numeral] of numerals) {
    while (remainder >= number) {
      result += numeral;
      remainder -= number;
    }
  }
  return format === "roman-lower" ? result.toLowerCase() : result;
}

export function resolvePageNumberPlacement(
  physicalIndex: number,
  placement: PageNumbering["placement"],
): ResolvedPageNumberPlacement {
  if (placement.horizontal === "center") {
    return { vertical: placement.vertical, horizontal: "center" };
  }

  const side = pageSide(physicalIndex);
  const horizontal = placement.horizontal === "outer"
    ? side === "left" ? "left" : "right"
    : side === "left" ? "right" : "left";

  return { vertical: placement.vertical, horizontal };
}

export function resolvePageNumber(
  page: BookPage,
  physicalIndex: number,
  numbering: PageNumbering,
): ResolvedPageNumber {
  const range = activeRange(numbering.ranges, physicalIndex);
  if (!range) {
    return {
      physicalIndex,
      physicalNumber: physicalIndex + 1,
      logicalNumber: null,
      label: null,
      visible: false,
      rangeId: null,
    };
  }

  const logicalNumber =
    range.logicalStart + physicalIndex - range.fromPhysicalIndex;
  const inDisplayRange = numbering.display.logicalRanges.some(
    ({ from, to }) =>
      logicalNumber >= from && (to === undefined || logicalNumber <= to),
  );
  const policyVisible = numbering.display.logicalRanges.length
    ? inDisplayRange
    : numbering.display.defaultVisible;
  const visible =
    page.pageNumberVisible ??
    (policyVisible &&
      !numbering.display.hiddenLogicalNumbers.includes(logicalNumber) &&
      !numbering.display.hiddenPageIds.includes(page.id));

  return {
    physicalIndex,
    physicalNumber: physicalIndex + 1,
    logicalNumber,
    label: `${range.prefix ?? ""}${formatLogicalNumber(logicalNumber, range.format)}${range.suffix ?? ""}`,
    visible,
    rangeId: range.id,
  };
}
