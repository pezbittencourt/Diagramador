import { useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DocumentGuide, PageSetup } from "../domain/document";
import { millimetersToPixels, pixelsToMillimeters } from "../domain/objectGeometry";
import { resolveFacingEdges } from "../domain/pageGeometry";

interface PagePrecisionOverlayProps {
  pageIndex: number;
  setup: PageSetup;
  scale: number;
  active: boolean;
  showRulers: boolean;
  showGuides: boolean;
  guides: DocumentGuide[];
  onBeginMutation: () => void;
  onGuideChange: (guide: DocumentGuide) => void;
}

interface GuideDrag {
  pointerId: number;
  startClient: number;
  guide: DocumentGuide;
}

function ticks(lengthMm: number): number[] {
  return Array.from({ length: Math.floor(lengthMm / 5) + 1 }, (_, index) => index * 5);
}

export function PagePrecisionOverlay({
  pageIndex,
  setup,
  scale,
  active,
  showRulers,
  showGuides,
  guides,
  onBeginMutation,
  onGuideChange,
}: PagePrecisionOverlayProps) {
  const [drag, setDrag] = useState<GuideDrag>();
  const bleed = resolveFacingEdges(setup.bleed, pageIndex, setup.mirroredMargins);
  const px = (value: number) => millimetersToPixels(value, scale);

  const startGuideDrag = (event: ReactPointerEvent<HTMLButtonElement>, guide: DocumentGuide) => {
    if (!active || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onBeginMutation();
    setDrag({
      pointerId: event.pointerId,
      startClient: guide.orientation === "vertical" ? event.clientX : event.clientY,
      guide,
    });
  };

  const moveGuide = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const client = drag.guide.orientation === "vertical" ? event.clientX : event.clientY;
    onGuideChange({
      ...drag.guide,
      positionMm: drag.guide.positionMm + pixelsToMillimeters(client - drag.startClient, scale),
    });
  };

  return (
    <div className="precision-overlay" contentEditable={false}>
      {active && showRulers && (
        <>
          <div
            className="page-ruler horizontal-ruler"
            style={{ left: px(bleed.left), top: -22, width: px(setup.width) }}
            aria-label="Régua horizontal em milímetros"
          >
            {ticks(setup.width).map((value) => (
              <i key={value} className={value % 10 === 0 ? "major" : "minor"} style={{ left: px(value) }}>
                {value % 10 === 0 ? <span>{value}</span> : null}
              </i>
            ))}
          </div>
          <div
            className="page-ruler vertical-ruler"
            style={{ left: px(bleed.left) - 22, top: px(bleed.top), height: px(setup.height) }}
            aria-label="Régua vertical em milímetros"
          >
            {ticks(setup.height).map((value) => (
              <i key={value} className={value % 10 === 0 ? "major" : "minor"} style={{ top: px(value) }}>
                {value % 10 === 0 ? <span>{value}</span> : null}
              </i>
            ))}
          </div>
        </>
      )}
      {showGuides && guides.map((guide) => (
        <button
          type="button"
          key={guide.id}
          className={`custom-guide custom-guide-${guide.orientation} ${active ? "active-page-guide" : ""}`}
          style={guide.orientation === "vertical"
            ? { left: px(bleed.left + guide.positionMm) }
            : { top: px(bleed.top + guide.positionMm) }}
          aria-label={`Guia ${guide.orientation} em ${guide.positionMm.toFixed(1)} mm`}
          onPointerDown={(event) => startGuideDrag(event, guide)}
          onPointerMove={moveGuide}
          onPointerUp={(event) => { if (drag?.pointerId === event.pointerId) setDrag(undefined); }}
          onPointerCancel={() => setDrag(undefined)}
        />
      ))}
    </div>
  );
}
