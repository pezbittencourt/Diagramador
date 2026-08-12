import { useMemo, useRef, useState } from "react";
import type {
  BookPage,
  PageNumbering,
  PageSetup,
  ParagraphStyle,
  RichTextDocument,
} from "../domain/document";
import type { LayoutSnapshot } from "../layout/layoutTypes";
import { PagePreview } from "./PagePreview";
import { StoryEditor } from "./StoryEditor";

interface WorkspaceProps {
  setup: PageSetup;
  pages: BookPage[];
  styles: ParagraphStyle[];
  storyContent: RichTextDocument;
  layout: LayoutSnapshot;
  numbering: PageNumbering;
  zoom: number;
  showMargins: boolean;
  showBleed: boolean;
  pageBreakRequest: number;
  onStoryChange: (content: RichTextDocument) => void;
  onInsertPageBreak: () => void;
  onZoomChange: (zoom: number) => void;
}

interface Spread {
  label: string;
  pageIndexes: number[];
}

function createSpreads(pageCount: number): Spread[] {
  const spreads: Spread[] = [{ label: "PÁGINA 01", pageIndexes: [0] }];
  for (let index = 1; index < pageCount; index += 2) {
    const pageIndexes = index + 1 < pageCount ? [index, index + 1] : [index];
    spreads.push({
      label: pageIndexes.length === 2
        ? `SPREAD ${String(index + 1).padStart(2, "0")}–${String(index + 2).padStart(2, "0")}`
        : `PÁGINA ${String(index + 1).padStart(2, "0")}`,
      pageIndexes,
    });
  }
  return spreads;
}

export function Workspace({
  setup,
  pages,
  styles,
  storyContent,
  layout,
  numbering,
  zoom,
  showMargins,
  showBleed,
  pageBreakRequest,
  onStoryChange,
  onInsertPageBreak,
  onZoomChange,
}: WorkspaceProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [targetPage, setTargetPage] = useState("1");
  const spreads = useMemo(() => createSpreads(layout.pages.length), [layout.pages.length]);

  const fitSpread = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const availableWidth = viewport.clientWidth - 128;
    const spreadMm = setup.width * 2 + setup.bleed.inner * 2 + setup.bleed.outer * 2 + 12;
    const scaleAt100 = 96 / 25.4;
    onZoomChange(Math.max(25, Math.min(150, (availableWidth / (spreadMm * scaleAt100)) * 100)));
  };

  const goToPage = () => {
    const number = Math.max(1, Math.min(layout.pages.length, Number(targetPage) || 1));
    setTargetPage(String(number));
    viewportRef.current
      ?.querySelector<HTMLElement>(`[data-page-index="${number - 1}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  };

  return (
    <main className="workspace">
      <header className="workspace-toolbar">
        <div className="view-switcher" aria-label="Modo de visualização">
          <button className="view-button active" type="button" aria-pressed="true">Spread</button>
          <button className="view-button" type="button" disabled>Página única</button>
          <button className="page-break-button" type="button" onClick={onInsertPageBreak}>
            Quebra de página
          </button>
        </div>
        <div className="workspace-tools">
          <label className="page-navigation">
            <span>Ir para</span>
            <input
              aria-label="Ir para página física"
              type="number"
              min="1"
              max={layout.pages.length}
              value={targetPage}
              onChange={(event) => setTargetPage(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === "Enter") goToPage(); }}
            />
            <button type="button" onClick={goToPage}>Ir</button>
          </label>
          <div className="zoom-control">
            <button type="button" aria-label="Diminuir zoom" onClick={() => onZoomChange(Math.max(25, zoom - 10))}>−</button>
            <input aria-label="Zoom" type="range" min="25" max="200" step="5" value={zoom} onChange={(event) => onZoomChange(Number(event.currentTarget.value))} />
            <button type="button" aria-label="Aumentar zoom" onClick={() => onZoomChange(Math.min(200, zoom + 10))}>+</button>
            <output>{Math.round(zoom)}%</output>
            <button className="fit-button" type="button" onClick={fitSpread}>Ajustar spread</button>
          </div>
        </div>
      </header>

      <div className="canvas-viewport" ref={viewportRef}>
        <div className="canvas-stage">
          <StoryEditor
            content={storyContent}
            onChange={onStoryChange}
            pageBreakRequest={pageBreakRequest}
          >
            {spreads.map((spread) => (
              <section className="spread-unit" key={spread.pageIndexes[0]}>
                <div className="spread-label" contentEditable={false}>
                  <span>{spread.label}</span>
                  <span>{setup.width} × {setup.height} mm</span>
                </div>
                <div className={`spread ${spread.pageIndexes.length === 1
                  ? `single-page-spread single-page-${spread.pageIndexes[0] % 2 === 0 ? "right" : "left"}`
                  : ""}`}>
                  {spread.pageIndexes.map((physicalIndex, index) => (
                    <div className="page-slot" key={pages[physicalIndex]?.id ?? physicalIndex}>
                      {index > 0 && <div className="spine" contentEditable={false} aria-hidden="true" />}
                      <PagePreview
                        setup={setup}
                        page={pages[physicalIndex] ?? { id: `preview-${physicalIndex}`, objects: [] }}
                        layoutPage={layout.pages[physicalIndex]}
                        styles={styles}
                        numbering={numbering}
                        scale={zoom / 100}
                        showMargins={showMargins}
                        showBleed={showBleed}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </StoryEditor>
          <p className="canvas-note" contentEditable={false}>
            O texto é uma história contínua. As páginas e a numeração são recalculadas automaticamente.
          </p>
        </div>
      </div>
    </main>
  );
}
