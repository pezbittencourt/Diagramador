import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AssetReference,
  BookPage,
  DocumentGuide,
  PageNumbering,
  PageSetup,
  ParagraphStyle,
  RichTextDocument,
  PositionedObject,
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
  assets: AssetReference[];
  guides: DocumentGuide[];
  showRulers: boolean;
  showCustomGuides: boolean;
  snapEnabled: boolean;
  viewMode: "spread" | "single";
  activePageIndex: number;
  selectedObject?: { pageIndex: number; objectId: string };
  pageBreakRequest: number;
  onStoryChange: (content: RichTextDocument) => void;
  onStylesChange: (styles: ParagraphStyle[]) => void;
  onInsertPageBreak: () => void;
  onZoomChange: (zoom: number) => void;
  onViewModeChange: (mode: "spread" | "single") => void;
  onActivePageChange: (pageIndex: number) => void;
  onInsertImage: () => void;
  onSelectObject: (pageIndex: number, objectId?: string) => void;
  onBeginGraphicMutation: () => void;
  onObjectChange: (pageIndex: number, object: PositionedObject) => void;
  onDeleteObject: (pageIndex: number, objectId: string) => void;
  onDuplicateObject: (pageIndex: number, objectId: string) => void;
  onCopyObject: (pageIndex: number, objectId: string) => void;
  onPasteObject: () => void;
  onGraphicUndo: () => void;
  onGraphicRedo: () => void;
  onGuideChange: (guide: DocumentGuide) => void;
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
  assets,
  guides,
  showRulers,
  showCustomGuides,
  snapEnabled,
  viewMode,
  activePageIndex,
  selectedObject,
  pageBreakRequest,
  onStoryChange,
  onStylesChange,
  onInsertPageBreak,
  onZoomChange,
  onViewModeChange,
  onActivePageChange,
  onInsertImage,
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
}: WorkspaceProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const commandIdRef = useRef(0);
  const [targetPage, setTargetPage] = useState("1");
  const [command, setCommand] = useState<EditorCommand>();
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);
  const [formatting, setFormatting] = useState<SelectionFormatting>(() =>
    selectionFormatting(storyContent, styles, { anchor: 0, head: 0 }),
  );
  const spreads = useMemo(() => createSpreads(pages.length), [pages.length]);
  const spreadGap = 12 * 96 / 25.4 * zoom / 100;
  const spreadPageWidth = (
    setup.width + setup.bleed.inner + setup.bleed.outer
  ) * 96 / 25.4 * zoom / 100;

  useEffect(() => setTargetPage(String(activePageIndex + 1)), [activePageIndex]);

  useEffect(() => {
    const onObjectKeyDown = (event: KeyboardEvent) => {
      if (!selectedObject) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(".positioned-object")) return;
      if (target?.matches("input, textarea, select") || target?.closest(".story-editor")) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === "d") {
        event.preventDefault();
        onDuplicateObject(selectedObject.pageIndex, selectedObject.objectId);
      } else if (modifier && key === "c") {
        event.preventDefault();
        onCopyObject(selectedObject.pageIndex, selectedObject.objectId);
      } else if (modifier && key === "v") {
        event.preventDefault();
        onPasteObject();
      } else if (modifier && key === "z") {
        event.preventDefault();
        event.shiftKey ? onGraphicRedo() : onGraphicUndo();
      } else if (modifier && key === "y") {
        event.preventDefault();
        onGraphicRedo();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onDeleteObject(selectedObject.pageIndex, selectedObject.objectId);
      } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        const object = pages[selectedObject.pageIndex]?.objects.find((candidate) => candidate.id === selectedObject.objectId);
        if (!object) return;
        event.preventDefault();
        const step = event.shiftKey ? 5 : 0.5;
        onBeginGraphicMutation();
        onObjectChange(selectedObject.pageIndex, {
          ...object,
          x: object.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
          y: object.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
        });
      }
    };
    window.addEventListener("keydown", onObjectKeyDown);
    return () => window.removeEventListener("keydown", onObjectKeyDown);
  }, [
    onBeginGraphicMutation,
    onCopyObject,
    onDeleteObject,
    onDuplicateObject,
    onGraphicRedo,
    onGraphicUndo,
    onObjectChange,
    onPasteObject,
    pages,
    selectedObject,
  ]);

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

  const fitPage = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const scaleAt100 = 96 / 25.4;
    const horizontal = (viewport.clientWidth - 150) /
      ((setup.width + setup.bleed.inner + setup.bleed.outer) * scaleAt100);
    const vertical = (viewport.clientHeight - 120) /
      ((setup.height + setup.bleed.top + setup.bleed.bottom) * scaleAt100);
    onZoomChange(Math.max(25, Math.min(200, Math.min(horizontal, vertical) * 100)));
  };

  const goToPage = () => {
    const number = Math.max(1, Math.min(pages.length, Number(targetPage) || 1));
    setTargetPage(String(number));
    onActivePageChange(number - 1);
    if (viewMode === "single") return;
    viewportRef.current
      ?.querySelector<HTMLElement>(`[data-page-index="${number - 1}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  };

  const navigateTo = (pageIndex: number) => {
    const next = Math.max(0, Math.min(pages.length - 1, pageIndex));
    onActivePageChange(next);
    setTargetPage(String(next + 1));
    if (viewMode === "spread") {
      window.requestAnimationFrame(() => viewportRef.current
        ?.querySelector<HTMLElement>(`[data-page-index="${next}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }));
    }
  };

  const visibleSpreads = viewMode === "spread" ? spreads : [{
    label: `Página ${activePageIndex + 1}`,
    pages: [{ physicalIndex: activePageIndex, slot: "right" as const }],
  }];

  return (
    <main className="workspace">
      <header className="workspace-toolbar">
        <div className="view-switcher" aria-label="Modo de visualização">
          <button className={`view-button ${viewMode === "spread" ? "active" : ""}`} type="button" aria-pressed={viewMode === "spread"} onClick={() => onViewModeChange("spread")}>Spread</button>
          <button className={`view-button ${viewMode === "single" ? "active" : ""}`} type="button" aria-pressed={viewMode === "single"} onClick={() => onViewModeChange("single")}>Página única</button>
          <button className="insert-image-button" type="button" onClick={onInsertImage}>Inserir imagem</button>
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
              max={pages.length}
              value={targetPage}
              onChange={(event) => setTargetPage(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === "Enter") goToPage(); }}
            />
            <button type="button" onClick={goToPage}>Ir</button>
            <button type="button" aria-label="Página anterior" disabled={activePageIndex <= 0} onClick={() => navigateTo(activePageIndex - 1)}>‹</button>
            <button type="button" aria-label="Próxima página" disabled={activePageIndex >= pages.length - 1} onClick={() => navigateTo(activePageIndex + 1)}>›</button>
          </label>
          <div className="zoom-control">
            <button type="button" aria-label="Diminuir zoom" onClick={() => onZoomChange(Math.max(25, zoom - 10))}>−</button>
            <input aria-label="Zoom" type="range" min="25" max="200" step="5" value={zoom} onChange={(event) => onZoomChange(Number(event.currentTarget.value))} />
            <button type="button" aria-label="Aumentar zoom" onClick={() => onZoomChange(Math.min(200, zoom + 10))}>+</button>
            <output>{Math.round(zoom)}%</output>
            <button className="fit-button" type="button" onClick={fitSpread}>Ajustar spread</button>
            <button className="fit-button" type="button" onClick={fitPage}>Ajustar página</button>
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
        <div className={`canvas-stage ${viewMode === "single" ? "single-page-mode" : "spread-mode"}`}>
          <StoryEditor
            content={storyContent}
            styles={styles}
            onChange={onStoryChange}
            onSelectionFormattingChange={setFormatting}
            pageBreakRequest={pageBreakRequest}
            command={command}
          >
            {visibleSpreads.map((spread) => (
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
                        layoutPage={layout.pages[physicalIndex] ?? { physicalIndex, fragments: [], usedHeightMm: 0 }}
                        styles={styles}
                        numbering={numbering}
                        scale={zoom / 100}
                        showMargins={showMargins}
                        showBleed={showBleed}
                        active={activePageIndex === physicalIndex}
                        selectedObjectId={selectedObject?.pageIndex === physicalIndex ? selectedObject.objectId : undefined}
                        assets={assets}
                        guides={guides}
                        showRulers={showRulers}
                        showCustomGuides={showCustomGuides}
                        snapEnabled={snapEnabled}
                        onActivate={() => onActivePageChange(physicalIndex)}
                        onSelectObject={(objectId) => onSelectObject(physicalIndex, objectId)}
                        onBeginGraphicMutation={onBeginGraphicMutation}
                        onObjectChange={(object) => onObjectChange(physicalIndex, object)}
                        onDeleteObject={(objectId) => onDeleteObject(physicalIndex, objectId)}
                        onDuplicateObject={(objectId) => onDuplicateObject(physicalIndex, objectId)}
                        onCopyObject={(objectId) => onCopyObject(physicalIndex, objectId)}
                        onPasteObject={onPasteObject}
                        onGraphicUndo={onGraphicUndo}
                        onGraphicRedo={onGraphicRedo}
                        onGuideChange={onGuideChange}
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
