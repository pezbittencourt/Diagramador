import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { Workspace } from "./components/Workspace";
import { createDefaultDocument } from "./domain/defaultDocument";
import type {
  BookDocument,
  BookPage,
  DocumentGuide,
  PageNumbering,
  PageSetup,
  ParagraphStyle,
  RichTextDocument,
  PositionedImageObject,
  PositionedObject,
} from "./domain/document";
import {
  alignObjectToPage,
  createEmbeddedImagePlacement,
  keepObjectRecoverable,
  reorderPositionedObjects,
  setPositionedObjectMeasure,
  type PageAlignment,
  type StackAction,
} from "./domain/objectGeometry";
import { isValidPageSetup, resolveFacingEdges } from "./domain/pageGeometry";
import { docxHtmlToStoryContent } from "./domain/manuscriptImport";
import {
  mainStory,
  plainTextToStoryContent,
  storyToPlainText,
} from "./domain/textStory";
import { composeStory } from "./layout/pagination";
import { synchronizePhysicalPages } from "./layout/pageSynchronization";
import { CanvasTextMeasurer } from "./layout/textMeasurement";
import { parseDocument, serializeDocument } from "./persistence/documentCodec";

interface Notice {
  kind: "success" | "error";
  text: string;
}

interface ObjectSelection {
  pageIndex: number;
  objectId: string;
}

interface GraphicSnapshot {
  pages: BookPage[];
  assets: BookDocument["assets"];
  guides: DocumentGuide[];
}

interface ObjectClipboard {
  object: PositionedImageObject;
  asset?: BookDocument["assets"][number];
}

function readImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Não foi possível decodificar a imagem selecionada."));
    image.src = dataUrl;
  });
}

function suggestedFileName(title: string): string {
  const safeTitle = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
  return `${safeTitle || "livro-sem-titulo"}.livro.json`;
}

export default function App() {
  const [book, setBook] = useState(createDefaultDocument);
  const [filePath, setFilePath] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [zoom, setZoom] = useState(72);
  const [notice, setNotice] = useState<Notice>();
  const [pageBreakRequest, setPageBreakRequest] = useState(0);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [objectSelection, setObjectSelection] = useState<ObjectSelection>();
  const bookRef = useRef(book);
  const graphicHistoryRef = useRef<{ past: GraphicSnapshot[]; future: GraphicSnapshot[] }>({
    past: [],
    future: [],
  });
  const objectClipboardRef = useRef<ObjectClipboard | undefined>(undefined);
  const nativeApi = window.livroStudio;
  const measurer = useMemo(() => new CanvasTextMeasurer(), []);
  const story = mainStory(book.stories);
  const layout = useMemo(() => composeStory({
    storyId: story.id,
    content: story.content,
    pageSetup: book.pageSetup,
    styles: book.styles,
    measurer,
    revision: 0,
  }), [book.pageSetup, book.styles, measurer, story.content, story.id]);
  const physicalPages = useMemo(
    () => synchronizePhysicalPages(book.pages, layout.pages.length),
    [book.pages, layout.pages.length],
  );

  useEffect(() => { bookRef.current = book; }, [book]);

  useEffect(() => {
    if (book.pages.length === physicalPages.length &&
        book.pages.every((page, index) => page === physicalPages[index])) return;
    setBook((current) => {
      const next = { ...current, pages: physicalPages };
      bookRef.current = next;
      return next;
    });
  }, [book.pages, physicalPages]);

  useEffect(() => {
    setActivePageIndex((current) => Math.min(Math.max(0, current), physicalPages.length - 1));
    setObjectSelection((current) => current && physicalPages[current.pageIndex]?.objects
      .some((object) => object.id === current.objectId) ? current : undefined);
  }, [physicalPages]);

  const updateBook = useCallback((updater: (current: BookDocument) => BookDocument) => {
    setBook((current) => {
      const next = { ...updater(current), updatedAt: new Date().toISOString() };
      bookRef.current = next;
      return next;
    });
    setDirty(true);
  }, []);

  const updatePageSetup = (pageSetup: PageSetup) => {
    updateBook((current) => ({ ...current, pageSetup }));
  };

  const updateNumbering = (numbering: PageNumbering) => {
    updateBook((current) => ({ ...current, numbering }));
  };

  const updateStyles = useCallback((styles: ParagraphStyle[]) => {
    updateBook((current) => ({ ...current, styles }));
  }, [updateBook]);

  const updateStory = useCallback((content: RichTextDocument) => {
    updateBook((current) => {
      const currentStory = mainStory(current.stories);
      const nextStory = { ...currentStory, content };
      const storyIndex = current.stories.findIndex((candidate) => candidate.id === currentStory.id);
      const stories = storyIndex >= 0
        ? current.stories.map((candidate, index) => index === storyIndex ? nextStory : candidate)
        : [nextStory, ...current.stories];
      return { ...current, stories };
    });
  }, [updateBook]);

  const graphicSnapshot = useCallback((): GraphicSnapshot => ({
    pages: bookRef.current.pages,
    assets: bookRef.current.assets,
    guides: bookRef.current.guides,
  }), []);

  const beginGraphicMutation = useCallback(() => {
    const history = graphicHistoryRef.current;
    history.past.push(graphicSnapshot());
    if (history.past.length > 100) history.past.shift();
    history.future = [];
  }, [graphicSnapshot]);

  const restoreGraphicSnapshot = useCallback((snapshot: GraphicSnapshot) => {
    setBook((current) => {
      const next = {
        ...current,
        pages: snapshot.pages,
        assets: snapshot.assets,
        guides: snapshot.guides,
        updatedAt: new Date().toISOString(),
      };
      bookRef.current = next;
      return next;
    });
    setDirty(true);
  }, []);

  const undoGraphicMutation = useCallback(() => {
    const history = graphicHistoryRef.current;
    const previous = history.past.pop();
    if (!previous) return;
    history.future.push(graphicSnapshot());
    restoreGraphicSnapshot(previous);
  }, [graphicSnapshot, restoreGraphicSnapshot]);

  const redoGraphicMutation = useCallback(() => {
    const history = graphicHistoryRef.current;
    const next = history.future.pop();
    if (!next) return;
    history.past.push(graphicSnapshot());
    restoreGraphicSnapshot(next);
  }, [graphicSnapshot, restoreGraphicSnapshot]);

  const updateObject = useCallback((pageIndex: number, nextObject: PositionedObject) => {
    updateBook((current) => {
      const pages = synchronizePhysicalPages(current.pages, Math.max(layout.pages.length, pageIndex + 1));
      return {
        ...current,
        pages: pages.map((page, index) => index === pageIndex
          ? { ...page, objects: page.objects.map((object) => object.id === nextObject.id ? nextObject : object) }
          : page),
      };
    });
  }, [layout.pages.length, updateBook]);

  const selectedObject = useMemo(() => {
    if (!objectSelection) return undefined;
    const object = physicalPages[objectSelection.pageIndex]?.objects.find(
      (candidate): candidate is PositionedImageObject => candidate.id === objectSelection.objectId && candidate.type === "image",
    );
    return object ? { pageIndex: objectSelection.pageIndex, object } : undefined;
  }, [objectSelection, physicalPages]);

  const selectObject = useCallback((pageIndex: number, objectId?: string) => {
    setActivePageIndex(pageIndex);
    setObjectSelection(objectId ? { pageIndex, objectId } : undefined);
  }, []);

  const activatePage = useCallback((pageIndex: number) => {
    setActivePageIndex(pageIndex);
    setObjectSelection((current) => current?.pageIndex === pageIndex ? current : undefined);
  }, []);

  const insertImage = useCallback(async () => {
    if (!nativeApi) return;
    try {
      const result = await nativeApi.pickImage();
      if (result.canceled) return;
      const dataUrl = `data:${result.image.mimeType};base64,${result.image.data}`;
      const dimensions = await readImageDimensions(dataUrl);
      const placement = createEmbeddedImagePlacement({
        ...result.image,
        pixelWidth: dimensions.width,
        pixelHeight: dimensions.height,
      }, book.pageSetup.width, book.pageSetup.height);
      beginGraphicMutation();
      const pageIndex = activePageIndex;
      updateBook((current) => {
        const pages = synchronizePhysicalPages(current.pages, Math.max(layout.pages.length, pageIndex + 1));
        const highestZ = Math.max(-1, ...pages[pageIndex].objects.map((object) => object.zIndex));
        const object = { ...placement.object, zIndex: highestZ + 1 };
        return {
          ...current,
          assets: [...current.assets, placement.asset],
          pages: pages.map((page, index) => index === pageIndex
            ? { ...page, objects: [...page.objects, object] }
            : page),
        };
      });
      setObjectSelection({ pageIndex, objectId: placement.object.id });
      setNotice({ kind: "success", text: `${result.image.fileName} inserida na página ${pageIndex + 1}.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Não foi possível inserir a imagem." });
    }
  }, [activePageIndex, beginGraphicMutation, book.pageSetup.height, book.pageSetup.width, layout.pages.length, nativeApi, updateBook]);

  const deleteObject = useCallback((pageIndex: number, objectId: string) => {
    beginGraphicMutation();
    updateBook((current) => {
      const pages = current.pages.map((page, index) => index === pageIndex
        ? { ...page, objects: page.objects.filter((object) => object.id !== objectId) }
        : page);
      const usedAssetIds = new Set(pages.flatMap((page) => page.objects
        .filter((object): object is PositionedImageObject => object.type === "image")
        .map((object) => object.assetId)));
      return { ...current, pages, assets: current.assets.filter((asset) => usedAssetIds.has(asset.id)) };
    });
    setObjectSelection(undefined);
  }, [beginGraphicMutation, updateBook]);

  const duplicateObject = useCallback((pageIndex: number, objectId: string) => {
    const source = physicalPages[pageIndex]?.objects.find(
      (object): object is PositionedImageObject => object.id === objectId && object.type === "image",
    );
    if (!source) return;
    beginGraphicMutation();
    const duplicate = { ...source, id: crypto.randomUUID(), x: source.x + 5, y: source.y + 5 };
    updateBook((current) => ({
      ...current,
      pages: current.pages.map((page, index) => index === pageIndex
        ? {
            ...page,
            objects: [...page.objects, {
              ...duplicate,
              zIndex: Math.max(-1, ...page.objects.map((object) => object.zIndex)) + 1,
            }],
          }
        : page),
    }));
    setObjectSelection({ pageIndex, objectId: duplicate.id });
  }, [beginGraphicMutation, physicalPages, updateBook]);

  const copyObject = useCallback((pageIndex: number, objectId: string) => {
    const object = physicalPages[pageIndex]?.objects.find(
      (candidate): candidate is PositionedImageObject => candidate.id === objectId && candidate.type === "image",
    );
    if (object) objectClipboardRef.current = {
      object,
      asset: bookRef.current.assets.find((asset) => asset.id === object.assetId),
    };
  }, [physicalPages]);

  const pasteObject = useCallback(() => {
    const clipboard = objectClipboardRef.current;
    if (!clipboard) return;
    const source = clipboard.object;
    beginGraphicMutation();
    const pageIndex = activePageIndex;
    const duplicate = { ...source, id: crypto.randomUUID(), x: source.x + 5, y: source.y + 5 };
    updateBook((current) => {
      const pages = synchronizePhysicalPages(current.pages, Math.max(layout.pages.length, pageIndex + 1));
      return {
        ...current,
        assets: clipboard.asset && !current.assets.some((asset) => asset.id === clipboard.asset?.id)
          ? [...current.assets, clipboard.asset]
          : current.assets,
        pages: pages.map((page, index) => index === pageIndex
          ? { ...page, objects: [...page.objects, { ...duplicate, zIndex: page.objects.length }] }
          : page),
      };
    });
    setObjectSelection({ pageIndex, objectId: duplicate.id });
  }, [activePageIndex, beginGraphicMutation, layout.pages.length, updateBook]);

  const mutateSelectedObject = useCallback((
    mutation: (object: PositionedImageObject, page: BookPage) => PositionedImageObject | PositionedObject[],
  ) => {
    if (!selectedObject) return;
    beginGraphicMutation();
    updateBook((current) => ({
      ...current,
      pages: current.pages.map((page, pageIndex) => {
        if (pageIndex !== selectedObject.pageIndex) return page;
        const result = mutation(selectedObject.object, page);
        if (Array.isArray(result)) return { ...page, objects: result };
        return { ...page, objects: page.objects.map((object) => object.id === result.id ? result : object) };
      }),
    }));
  }, [beginGraphicMutation, selectedObject, updateBook]);

  const saveDocument = useCallback(async (saveAs = false): Promise<boolean> => {
    if (!nativeApi) return false;
    try {
      const savedDocument = {
        ...book,
        pages: physicalPages,
        updatedAt: new Date().toISOString(),
      };
      const result = await nativeApi.saveDocument({
        content: serializeDocument(savedDocument),
        filePath: saveAs ? undefined : filePath,
        suggestedName: suggestedFileName(book.title),
      });
      if (result.canceled) return false;
      setBook(savedDocument);
      setFilePath(result.filePath);
      setDirty(false);
      setNotice({ kind: "success", text: "Projeto salvo com sucesso." });
      return true;
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Não foi possível salvar o projeto." });
      return false;
    }
  }, [book, filePath, nativeApi, physicalPages]);

  const confirmDiscard = useCallback(async (action: string): Promise<boolean> => {
    if (!dirty || !nativeApi) return true;
    const decision = await nativeApi.confirmUnsavedChanges(action);
    if (decision === "cancel") return false;
    return decision !== "save" || saveDocument();
  }, [dirty, nativeApi, saveDocument]);

  const newDocument = useCallback(async () => {
    if (!(await confirmDiscard("criar um novo documento"))) return;
    setBook(createDefaultDocument());
    setFilePath(undefined);
    setDirty(false);
    setActivePageIndex(0);
    setObjectSelection(undefined);
    graphicHistoryRef.current = { past: [], future: [] };
    setNotice({ kind: "success", text: "Novo projeto criado." });
  }, [confirmDiscard]);

  const openDocument = useCallback(async () => {
    if (!nativeApi || !(await confirmDiscard("abrir outro documento"))) return;
    try {
      const result = await nativeApi.openDocument();
      if (result.canceled) return;
      setBook(parseDocument(result.content));
      setFilePath(result.filePath);
      setDirty(false);
      setActivePageIndex(0);
      setObjectSelection(undefined);
      graphicHistoryRef.current = { past: [], future: [] };
      setNotice({ kind: "success", text: "Projeto aberto com sucesso." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Não foi possível abrir o projeto." });
    }
  }, [confirmDiscard, nativeApi]);

  const updateGuide = useCallback((guide: DocumentGuide) => {
    updateBook((current) => ({
      ...current,
      guides: current.guides.map((candidate) => candidate.id === guide.id ? guide : candidate),
    }));
  }, [updateBook]);

  const addGuide = useCallback((orientation: DocumentGuide["orientation"]) => {
    beginGraphicMutation();
    updateBook((current) => ({
      ...current,
      guides: [...current.guides, {
        id: crypto.randomUUID(),
        orientation,
        positionMm: orientation === "vertical" ? current.pageSetup.width / 2 : current.pageSetup.height / 2,
      }],
    }));
  }, [beginGraphicMutation, updateBook]);

  const changeGuideFromPanel = useCallback((guide: DocumentGuide) => {
    beginGraphicMutation();
    updateGuide(guide);
  }, [beginGraphicMutation, updateGuide]);

  const deleteGuide = useCallback((guideId: string) => {
    beginGraphicMutation();
    updateBook((current) => ({
      ...current,
      guides: current.guides.filter((guide) => guide.id !== guideId),
    }));
  }, [beginGraphicMutation, updateBook]);

  const changeSelectedMeasure = useCallback((
    measure: "x" | "y" | "width" | "height",
    value: number,
  ) => mutateSelectedObject((object) => {
    const measured = setPositionedObjectMeasure(object, measure, value);
    const pageIndex = selectedObject?.pageIndex ?? 0;
    const bleed = resolveFacingEdges(
      bookRef.current.pageSetup.bleed,
      pageIndex,
      bookRef.current.pageSetup.mirroredMargins,
    );
    return {
      ...measured,
      ...keepObjectRecoverable(measured, measured.x, measured.y, {
        pageWidth: bookRef.current.pageSetup.width,
        pageHeight: bookRef.current.pageSetup.height,
        bleed,
      }),
    };
  }), [mutateSelectedObject, selectedObject?.pageIndex]);

  const changeSelectedAspectLock = useCallback((locked: boolean) => {
    mutateSelectedObject((object) => ({ ...object, lockAspectRatio: locked }));
  }, [mutateSelectedObject]);

  const stackSelectedObject = useCallback((action: StackAction) => {
    mutateSelectedObject((object, page) => reorderPositionedObjects(page.objects, object.id, action));
  }, [mutateSelectedObject]);

  const alignSelectedObject = useCallback((alignment: PageAlignment) => {
    mutateSelectedObject((object) => alignObjectToPage(
      object,
      alignment,
      bookRef.current.pageSetup.width,
      bookRef.current.pageSetup.height,
    ));
  }, [mutateSelectedObject]);

  const importManuscript = useCallback(async () => {
    if (!nativeApi) return;
    try {
      const result = await nativeApi.importManuscript();
      if (result.canceled) return;
      const hasText = storyToPlainText(story.content).trim().length > 0;
      if (hasText && !(await nativeApi.confirmReplaceManuscript())) return;
      updateStory(result.manuscript.format === "docx" && result.manuscript.html
        ? docxHtmlToStoryContent(result.manuscript.html)
        : plainTextToStoryContent(result.manuscript.text));
      const warningSuffix = result.manuscript.warnings.length
        ? ` ${result.manuscript.warnings.length} aviso(s) do conversor.`
        : "";
      setNotice({
        kind: "success",
        text: `${result.manuscript.fileName} importado e paginado.${warningSuffix}`,
      });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Não foi possível importar o manuscrito." });
    }
  }, [nativeApi, story.content, updateStory]);

  useEffect(() => {
    nativeApi?.setDirty(dirty);
    window.document.title = `${dirty ? "• " : ""}${book.title} — Livro Studio`;
  }, [book.title, dirty, nativeApi]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(undefined), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void saveDocument(event.shiftKey);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveDocument]);

  useEffect(() => nativeApi?.onSaveBeforeClose(() => {
    void saveDocument().then((saved) => nativeApi.finishClose(saved));
  }), [nativeApi, saveDocument]);

  const valid = isValidPageSetup(book.pageSetup);
  const presetName = book.pageSetup.preset === "custom" ? "Personalizado" : book.pageSetup.preset;
  const fileName = filePath?.split(/[\\/]/).at(-1);

  return (
    <div className="app-shell">
      <header className="app-bar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span><strong>Livro Studio</strong><small>objetos e precisão 0.7</small></span>
        </div>
        <div className="document-name" title={filePath ?? "Documento ainda não salvo"}>
          <span className={`saved-indicator ${dirty ? "dirty" : ""}`} />
          {book.title}{dirty && <span className="dirty-mark" aria-label="Alterações não salvas">●</span>}
        </div>
        <div className="app-actions">
          <button type="button" onClick={() => void newDocument()}>Novo</button>
          <button type="button" disabled={!nativeApi} onClick={() => void openDocument()}>Abrir projeto</button>
          <button type="button" disabled={!nativeApi} onClick={() => void importManuscript()}>Importar manuscrito</button>
          <button type="button" disabled={!nativeApi} onClick={() => void saveDocument()}>Salvar</button>
          <button className="save-as-button" type="button" disabled={!nativeApi} onClick={() => void saveDocument(true)}>Salvar como</button>
        </div>
      </header>

      <div className="app-content">
        <PropertiesPanel
          setup={book.pageSetup}
          numbering={book.numbering}
          showMargins={book.viewSettings.showMargins}
          showBleed={book.viewSettings.showBleed}
          showRulers={book.viewSettings.showRulers}
          showCustomGuides={book.viewSettings.showCustomGuides}
          snapEnabled={book.viewSettings.snapEnabled}
          guides={book.guides}
          selectedObject={selectedObject}
          onSetupChange={updatePageSetup}
          onNumberingChange={updateNumbering}
          onShowMarginsChange={(showMargins) => updateBook((current) => ({ ...current, viewSettings: { ...current.viewSettings, showMargins } }))}
          onShowBleedChange={(showBleed) => updateBook((current) => ({ ...current, viewSettings: { ...current.viewSettings, showBleed } }))}
          onShowRulersChange={(showRulers) => updateBook((current) => ({ ...current, viewSettings: { ...current.viewSettings, showRulers } }))}
          onShowCustomGuidesChange={(showCustomGuides) => updateBook((current) => ({ ...current, viewSettings: { ...current.viewSettings, showCustomGuides } }))}
          onSnapEnabledChange={(snapEnabled) => updateBook((current) => ({ ...current, viewSettings: { ...current.viewSettings, snapEnabled } }))}
          onAddGuide={addGuide}
          onGuideChange={changeGuideFromPanel}
          onDeleteGuide={deleteGuide}
          onObjectMeasureChange={changeSelectedMeasure}
          onObjectAspectLockChange={changeSelectedAspectLock}
          onObjectStack={stackSelectedObject}
          onObjectAlign={alignSelectedObject}
          onDuplicateObject={() => selectedObject && duplicateObject(selectedObject.pageIndex, selectedObject.object.id)}
          onDeleteObject={() => selectedObject && deleteObject(selectedObject.pageIndex, selectedObject.object.id)}
        />
        <Workspace
          setup={book.pageSetup}
          pages={physicalPages}
          styles={book.styles}
          storyContent={story.content}
          layout={layout}
          numbering={book.numbering}
          zoom={zoom}
          showMargins={book.viewSettings.showMargins}
          showBleed={book.viewSettings.showBleed}
          assets={book.assets}
          guides={book.guides}
          showRulers={book.viewSettings.showRulers}
          showCustomGuides={book.viewSettings.showCustomGuides}
          snapEnabled={book.viewSettings.snapEnabled}
          viewMode={book.viewSettings.viewMode}
          activePageIndex={activePageIndex}
          selectedObject={objectSelection}
          pageBreakRequest={pageBreakRequest}
          onStoryChange={updateStory}
          onStylesChange={updateStyles}
          onInsertPageBreak={() => setPageBreakRequest((current) => current + 1)}
          onZoomChange={setZoom}
          onViewModeChange={(viewMode) => updateBook((current) => ({ ...current, viewSettings: { ...current.viewSettings, viewMode } }))}
          onActivePageChange={activatePage}
          onInsertImage={() => void insertImage()}
          onSelectObject={selectObject}
          onBeginGraphicMutation={beginGraphicMutation}
          onObjectChange={updateObject}
          onDeleteObject={deleteObject}
          onDuplicateObject={duplicateObject}
          onCopyObject={copyObject}
          onPasteObject={pasteObject}
          onGraphicUndo={undoGraphicMutation}
          onGraphicRedo={redoGraphicMutation}
          onGuideChange={updateGuide}
        />
      </div>
      {!valid && <div className="validation-banner" role="alert">As margens precisam caber dentro da página e todos os valores devem ser positivos.</div>}
      {notice && <div className={`operation-notice notice-${notice.kind}`} role="status">{notice.text}</div>}
      <footer className="status-bar">
        <span>{physicalPages.length} {physicalPages.length === 1 ? "página" : "páginas"} · reflow {layout.composeTimeMs.toFixed(1)} ms</span>
        <span>{presetName} · margens {book.pageSetup.mirroredMargins ? "espelhadas" : "fixas"}</span>
        <span>{fileName ?? "Não salvo"} · {nativeApi ? `Desktop · v${nativeApi.version}` : "Preview web"}</span>
      </footer>
    </div>
  );
}
