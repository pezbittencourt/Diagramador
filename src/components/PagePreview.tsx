import type { CSSProperties } from "react";
import type {
  AssetReference,
  BookPage,
  DocumentGuide,
  PageNumbering,
  PageSetup,
  ParagraphStyle,
  PositionedObject,
} from "../domain/document";
import { pageSide, resolveFacingEdges } from "../domain/pageGeometry";
import { resolvePageNumber, resolvePageNumberPlacement } from "../domain/pageNumbering";
import type { LaidOutPage } from "../layout/layoutTypes";
import { PagePrecisionOverlay } from "./PagePrecisionOverlay";
import { PositionedObjectLayer } from "./PositionedObjectLayer";

interface PagePreviewProps {
  setup: PageSetup;
  page: BookPage;
  layoutPage: LaidOutPage;
  styles: ParagraphStyle[];
  numbering: PageNumbering;
  scale: number;
  showMargins: boolean;
  showBleed: boolean;
  active: boolean;
  selectedObjectId?: string;
  assets: AssetReference[];
  guides: DocumentGuide[];
  showRulers: boolean;
  showCustomGuides: boolean;
  snapEnabled: boolean;
  onActivate: () => void;
  onSelectObject: (objectId?: string) => void;
  onBeginGraphicMutation: () => void;
  onObjectChange: (object: PositionedObject) => void;
  onDeleteObject: (objectId: string) => void;
  onDuplicateObject: (objectId: string) => void;
  onCopyObject: (objectId: string) => void;
  onPasteObject: () => void;
  onGraphicUndo: () => void;
  onGraphicRedo: () => void;
  onGuideChange: (guide: DocumentGuide) => void;
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
  active,
  selectedObjectId,
  assets,
  guides,
  showRulers,
  showCustomGuides,
  snapEnabled,
  onActivate,
  onSelectObject,
  onBeginGraphicMutation,
  onObjectChange,
  onDeleteObject,
  onDuplicateObject,
  onCopyObject,
  onPasteObject,
  onGraphicUndo,
  onGraphicRedo,
  onGuideChange,
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
      className={`page-shell page-${side} ${active ? "active-page" : ""}`}
      style={shellStyle}
      aria-label={`Página física ${physicalIndex + 1}`}
      data-page-index={physicalIndex}
      onPointerDownCapture={(event) => {
        onActivate();
        const target = event.target as HTMLElement;
        if (!target.closest(".positioned-object, .custom-guide")) onSelectObject(undefined);
      }}
    >
      {showBleed && <div className="bleed-guide" contentEditable={false} aria-hidden="true" />}
      <div className="trim-page" style={pageStyle}>
        {showMargins && <div className="margin-guide" style={marginStyle} contentEditable={false} aria-hidden="true" />}
        <div className="text-frame" style={textFrameStyle}>
          {layoutPage.fragments.map((fragment) => {
            const style = fragment.paragraphStyle
              ?? styles.find((candidate) => candidate.id === fragment.styleId)
              ?? styles[0];
            const paragraphStyle: CSSProperties = style ? {
              fontFamily: style.fontFamily,
              fontSize: style.fontSizePt * PX_PER_PT * scale,
              fontWeight: style.fontWeight,
              fontStyle: style.italic ? "italic" : "normal",
              textDecoration: style.underline ? "underline" : "none",
              color: style.color,
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
                {fragment.runs.map((run, runIndex) => (
                  <span
                    key={`${run.from}-${run.to}-${runIndex}`}
                    data-story-from={run.globalFrom}
                    data-story-to={run.globalTo}
                    style={{
                      fontFamily: run.style.fontFamily,
                      fontSize: run.style.fontSizePt * PX_PER_PT * scale,
                      fontWeight: run.style.fontWeight,
                      fontStyle: run.style.italic ? "italic" : "normal",
                      textDecoration: run.style.underline ? "underline" : "none",
                      color: run.style.color,
                    }}
                  >{run.text || "\u200b"}</span>
                ))}
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
      <PagePrecisionOverlay
        pageIndex={physicalIndex}
        setup={setup}
        scale={scale}
        active={active}
        showRulers={showRulers}
        showGuides={showCustomGuides}
        guides={guides}
        onBeginMutation={onBeginGraphicMutation}
        onGuideChange={onGuideChange}
      />
      <PositionedObjectLayer
        pageIndex={physicalIndex}
        setup={setup}
        objects={page.objects}
        assets={assets}
        guides={guides}
        scale={scale}
        selectedObjectId={selectedObjectId}
        snapEnabled={snapEnabled}
        onSelect={onSelectObject}
        onBeginMutation={onBeginGraphicMutation}
        onChange={onObjectChange}
        onDelete={onDeleteObject}
        onDuplicate={onDuplicateObject}
        onCopy={onCopyObject}
        onPaste={onPasteObject}
        onUndo={onGraphicUndo}
        onRedo={onGraphicRedo}
      />
    </article>
  );
}
