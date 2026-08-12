import type { CSSProperties } from "react";
import type {
  BookPage,
  PageNumbering,
  PageSetup,
  ParagraphStyle,
} from "../domain/document";
import { pageSide, resolveFacingEdges } from "../domain/pageGeometry";
import { resolvePageNumber, resolvePageNumberPlacement } from "../domain/pageNumbering";
import type { LaidOutPage } from "../layout/layoutTypes";

interface PagePreviewProps {
  setup: PageSetup;
  page: BookPage;
  layoutPage: LaidOutPage;
  styles: ParagraphStyle[];
  numbering: PageNumbering;
  scale: number;
  showMargins: boolean;
  showBleed: boolean;
}

const PX_PER_MM = 96 / 25.4;
const PX_PER_PT = 96 / 72;

export function PagePreview({
  setup,
  page,
  layoutPage,
  styles,
  numbering,
  scale,
  showMargins,
  showBleed,
}: PagePreviewProps) {
  const physicalIndex = layoutPage.physicalIndex;
  const margins = resolveFacingEdges(setup.margins, physicalIndex, setup.mirroredMargins);
  const bleed = resolveFacingEdges(setup.bleed, physicalIndex, setup.mirroredMargins);
  const px = (millimeters: number) => millimeters * PX_PER_MM * scale;
  const side = pageSide(physicalIndex);
  const pageNumber = resolvePageNumber(page, physicalIndex, numbering);
  const folioPlacement = resolvePageNumberPlacement(physicalIndex, numbering.placement);
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
    top: px(margins.top), right: px(margins.right),
    bottom: px(margins.bottom), left: px(margins.left),
  };
  const textFrameStyle: CSSProperties = { ...marginStyle };

  return (
    <article
      className={`page-shell page-${side}`}
      style={shellStyle}
      aria-label={`Página física ${physicalIndex + 1}`}
      data-page-index={physicalIndex}
    >
      {showBleed && <div className="bleed-guide" contentEditable={false} aria-hidden="true" />}
      <div className="trim-page" style={pageStyle}>
        {showMargins && <div className="margin-guide" style={marginStyle} contentEditable={false} aria-hidden="true" />}
        <div className="text-frame" style={textFrameStyle}>
          {layoutPage.fragments.map((fragment) => {
            const style = styles.find((candidate) => candidate.id === fragment.styleId) ?? styles[0];
            const paragraphStyle: CSSProperties = style ? {
              fontFamily: style.fontFamily,
              fontSize: style.fontSizePt * PX_PER_PT * scale,
              lineHeight: style.lineHeight,
              textAlign: style.alignment,
              paddingLeft: px(style.leftIndentMm),
              paddingRight: px(style.rightIndentMm),
              textIndent: fragment.startsParagraph ? px(style.firstLineIndentMm) : 0,
              marginTop: fragment.startsParagraph ? style.spaceBeforePt * PX_PER_PT * scale : 0,
              marginBottom: fragment.endsParagraph ? style.spaceAfterPt * PX_PER_PT * scale : 0,
            } : {};
            return (
              <p
                className="story-fragment"
                style={paragraphStyle}
                key={`${fragment.blockId}-${fragment.from}`}
                data-block-id={fragment.blockId}
              >
                <span
                  data-story-from={fragment.globalFrom}
                  data-story-to={fragment.globalTo}
                >{fragment.text || "\u200b"}</span>
              </p>
            );
          })}
        </div>
        {pageNumber.visible && pageNumber.label && (
          <span
            className={`editorial-folio folio-${folioPlacement.vertical} folio-${folioPlacement.horizontal}`}
            contentEditable={false}
            aria-label={`Número editorial ${pageNumber.label}`}
          >{pageNumber.label}</span>
        )}
      </div>
    </article>
  );
}
