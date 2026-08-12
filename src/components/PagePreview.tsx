import type { CSSProperties } from "react";
import type { PageSetup } from "../domain/document";
import { pageSide, resolveFacingEdges } from "../domain/pageGeometry";

interface PagePreviewProps {
  setup: PageSetup;
  physicalIndex: number;
  scale: number;
  showMargins: boolean;
  showBleed: boolean;
}

const PX_PER_MM = 96 / 25.4;

export function PagePreview({
  setup,
  physicalIndex,
  scale,
  showMargins,
  showBleed,
}: PagePreviewProps) {
  const margins = resolveFacingEdges(setup.margins, physicalIndex, setup.mirroredMargins);
  const bleed = resolveFacingEdges(setup.bleed, physicalIndex, setup.mirroredMargins);
  const px = (millimeters: number) => millimeters * PX_PER_MM * scale;
  const side = pageSide(physicalIndex);
  const shellStyle: CSSProperties = {
    width: px(setup.width + bleed.left + bleed.right),
    height: px(setup.height + bleed.top + bleed.bottom),
  };
  const pageStyle: CSSProperties = {
    width: px(setup.width),
    height: px(setup.height),
    left: px(bleed.left),
    top: px(bleed.top),
  };
  const marginStyle: CSSProperties = {
    top: px(margins.top),
    right: px(margins.right),
    bottom: px(margins.bottom),
    left: px(margins.left),
  };

  return (
    <article
      className={`page-shell page-${side}`}
      style={shellStyle}
      aria-label={`Página física ${physicalIndex + 1}`}
    >
      {showBleed && <div className="bleed-guide" aria-hidden="true" />}
      <div className="trim-page" style={pageStyle}>
        {showMargins && <div className="margin-guide" style={marginStyle} aria-hidden="true" />}
        <div className="page-content-hint">
          <span>Página física {physicalIndex + 1}</span>
          <small>{side === "left" ? "verso · página esquerda" : "reto · página direita"}</small>
        </div>
        <span className={`sample-folio folio-${side}`}>{physicalIndex + 1}</span>
      </div>
    </article>
  );
}

