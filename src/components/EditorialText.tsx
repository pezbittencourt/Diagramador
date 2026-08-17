import type { CSSProperties } from "react";
import type { PageNumbering, PageSetup, ParagraphStyle } from "../domain/document";
import { resolvePageNumberPlacement } from "../domain/pageNumbering";
import type { LaidOutPage } from "../layout/layoutTypes";

export interface PhysicalUnitProjector {
  mm: (value: number) => string | number;
  pt: (value: number) => string | number;
}

interface ComposedTextLayerProps {
  layoutPage: LaidOutPage;
  styles: ParagraphStyle[];
  units: PhysicalUnitProjector;
}

export function ComposedTextLayer({ layoutPage, styles, units }: ComposedTextLayerProps) {
  return (
    <div className="editorial-text-layer">
      {layoutPage.fragments.flatMap((fragment) => {
        const paragraphStyle = fragment.paragraphStyle
          ?? styles.find((candidate) => candidate.id === fragment.styleId)
          ?? styles[0];
        return fragment.lines.map((line) => {
          const unusedWidthMm = Math.max(0, line.availableWidthMm - line.naturalWidthMm);
          const alignmentOffsetMm = line.alignment === "center"
            ? unusedWidthMm / 2
            : line.alignment === "right"
              ? unusedWidthMm
              : 0;
          return (
            <div
              className="composed-text-line story-fragment"
              key={`${fragment.blockId}-${line.from}`}
              data-block-id={fragment.blockId}
              data-paragraph-style={fragment.styleId}
              data-paragraph-alignment={paragraphStyle?.alignment}
              data-line-from={line.globalFrom}
              data-line-to={line.globalTo}
              data-line-hit-from={line.globalFrom}
              data-line-hit-to={line.globalTo}
              style={{
                left: units.mm(line.xMm - alignmentOffsetMm),
                top: units.mm(line.topMm),
                height: units.mm(line.heightMm),
                lineHeight: units.mm(line.heightMm),
                width: units.mm(Math.max(line.availableWidthMm, 0.01)),
                paddingLeft: units.mm(alignmentOffsetMm),
                wordSpacing: units.mm(line.wordSpacingMm),
                textAlign: "left",
                color: paragraphStyle?.color,
              }}
            >
              {line.runs.map((run, runIndex) => (
                <span
                  key={`${run.from}-${run.to}-${runIndex}`}
                  data-story-from={run.globalFrom}
                  data-story-to={run.globalTo}
                  style={{
                    fontFamily: run.style.fontFamily,
                    fontSize: units.pt(run.style.fontSizePt),
                    fontWeight: run.style.fontWeight,
                    fontStyle: run.style.italic ? "italic" : "normal",
                    textDecoration: run.style.underline ? "underline" : "none",
                    color: run.style.color,
                  }}
                >{run.text || "\u200b"}</span>
              ))}
            </div>
          );
        });
      })}
    </div>
  );
}

interface EditorialFolioProps {
  label?: string | null;
  visible: boolean;
  physicalIndex: number;
  setup: PageSetup;
  placement: PageNumbering["placement"];
  units: PhysicalUnitProjector;
}

const FOLIO_FONT_SIZE_PT = 7.5;
const FOLIO_VERTICAL_OFFSET_RATIO = 0.04;
const FOLIO_HORIZONTAL_OFFSET_RATIO = 0.07;

export function EditorialFolio({
  label,
  visible,
  physicalIndex,
  setup,
  placement,
  units,
}: EditorialFolioProps) {
  if (!visible || !label) return null;
  const resolved = resolvePageNumberPlacement(physicalIndex, placement);
  const style: CSSProperties = {
    fontSize: units.pt(FOLIO_FONT_SIZE_PT),
    lineHeight: 1,
  };
  if (resolved.vertical === "top") style.top = units.mm(setup.height * FOLIO_VERTICAL_OFFSET_RATIO);
  else style.bottom = units.mm(setup.height * FOLIO_VERTICAL_OFFSET_RATIO);
  if (resolved.horizontal === "left") style.left = units.mm(setup.width * FOLIO_HORIZONTAL_OFFSET_RATIO);
  else if (resolved.horizontal === "right") style.right = units.mm(setup.width * FOLIO_HORIZONTAL_OFFSET_RATIO);
  else {
    style.left = "50%";
    style.transform = "translateX(-50%)";
  }

  return (
    <span
      className="editorial-folio"
      style={style}
      contentEditable={false}
      aria-label={`Número editorial ${label}`}
    >{label}</span>
  );
}
