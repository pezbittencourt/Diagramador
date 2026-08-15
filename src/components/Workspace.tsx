import { useMemo, useRef, useState } from "react";
import type {
  BookPage,
  PageNumbering,
  PageSetup,
  ParagraphStyle,
  RichTextDocument,
} from "../domain/document";
import { selectionFormatting, type SelectionFormatting } from "../domain/textStory";
import type { LayoutSnapshot } from "../layout/layoutTypes";
import { createSpreads } from "../layout/spreads";
import type { EditorCommand, EditorCommandRequest } from "./editorCommands";
import { FormattingToolbar } from "./FormattingToolbar";
import { PagePreview } from "./PagePreview";
import { StoryEditor } from "./StoryEditor";
import { StyleEditor } from "./StyleEditor";

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
  onStylesChange: (styles: ParagraphStyle[]) => void;
  onInsertPageBreak: () => void;
  onZoomChange: (zoom: number) => void;
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
  onStylesChange,
  onInsertPageBreak,
  onZoomChange,
}: WorkspaceProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const commandIdRef = useRef(0);
  const [targetPage, setTargetPage] = useState("1");
  const [command, setCommand] = useState<EditorCommand>();
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);
  const [formatting, setFormatting] = useState<SelectionFormatting>(() =>
    selectionFormatting(storyContent, styles, { anchor: 0, head: 0 }),
  );
  const spreads = useMemo(() => createSpreads(layout.pages.length), [layout.pages.length]);
  const spreadGap = 12 * 96 / 25.4 * zoom / 100;
  const spreadPageWidth = (
    setup.width + setup.bleed.inner + setup.bleed.outer
  ) * 96 / 25.4 * zoom / 100;

  const dispatchCommand = (request: EditorCommandRequest) => {
    commandIdRef.current += 1;
    setCommand({ ...request, id: commandIdRef.current } as EditorCommand);
  };

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

      <FormattingToolbar
        styles={styles}
        formatting={formatting}
        onCommand={dispatchCommand}
        onEditStyles={() => setStyleEditorOpen(true)}
      />

      <div className="canvas-viewport" ref={viewportRef}>
        <div className="canvas-stage">
          <StoryEditor
            content={storyContent}
            styles={styles}
            onChange={onStoryChange}
            onSelectionFormattingChange={setFormatting}
            pageBreakRequest={pageBreakRequest}
            command={command}
          >
            {spreads.map((spread) => (
              <section className="spread-unit" key={spread.pages[0].physicalIndex}>
                <div className="spread-label" contentEditable={false}>
                  <span>{spread.label}</span>
                  <span>{setup.width} × {setup.height} mm</span>
                </div>
                <div
                  className="spread"
                  style={{
                    columnGap: spreadGap,
                    gridTemplateColumns: `${spreadPageWidth}px ${spreadPageWidth}px`,
                  }}
                  data-spread-page-count={spread.pages.length}
                >
                  {spread.pages.map(({ physicalIndex, slot }) => (
                    <div
                      className={`page-slot page-slot-${slot}`}
                      key={pages[physicalIndex]?.id ?? physicalIndex}
                    >
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
      {styleEditorOpen && (
        <StyleEditor
          styles={styles}
          onChange={onStylesChange}
          onClose={() => setStyleEditorOpen(false)}
        />
      )}
    </main>
  );
}
