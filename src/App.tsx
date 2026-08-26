import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { PdfExportDialog, type PdfExportOptions } from "./components/PdfExportDialog";
import { PdfExportDocument } from "./components/PdfExportDocument";
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
import { resolvePageNumber } from "./domain/pageNumbering";
import { docxHtmlToStoryContent } from "./domain/manuscriptImport";
import {
  mainStory,
  plainTextToStoryContent,
  storyToPlainText,
} from "./domain/textStory";
import { composeStory } from "./layout/pagination";
import type { LayoutSnapshot } from "./layout/layoutTypes";
import { synchronizePhysicalPages } from "./layout/pageSynchronization";
import { CanvasTextMeasurer } from "./layout/textMeasurement";
import { parseDocument, serializeDocument } from "./persistence/documentCodec";
import {
  collectExportFontRequests,
  validateExportFonts,
  waitForExportSurface,
} from "./pdf/exportReadiness";
import { serializePdfExportSurface } from "./pdf/exportMarkup";
import { parsePhysicalPageRange } from "./pdf/pageRange";

interface Notice {
  kind: "success" | "warning" | "error";
  text: string;
}

type SaveStatus = "saved" | "dirty" | "saving" | "autosaved" | "error";

interface RecoveryCandidate {
  documentId: string;
  title: string;
  savedAt: string;
  sourcePath?: string;
}

interface ObjectSelection {
  pageIndex: number;
  objectId: string;
}

interface GraphicSnapshot {
  pages: BookPage[];
  assets: BookDocument["assets"];
  guides: DocumentGuide[];
  styles: ParagraphStyle[];
}

interface ObjectClipboard {
  object: PositionedImageObject;
  asset?: BookDocument["assets"][number];
}

interface PdfExportJob {
  id: string;
  physicalPageIndexes: number[];
  includeBleed: boolean;
  book: BookDocument;
  pages: BookPage[];
  layout: LayoutSnapshot;
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
  return `${safeTitle || "livro-sem-titulo"}.livro`;
}

function suggestedPdfFileName(title: string): string {
  return suggestedFileName(title).replace(/\.livro$/u, ".pdf");
}

function userFacingError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/u, "")
    .replace(/^Error:\s*/u, "")
    .trim();
  if (!message || /\b(TypeError|ReferenceError|ENOENT|Unhandled Promise)\b/u.test(message)) return fallback;
  return message;
}

export default function App() {
  const [book, setBook] = useState(createDefaultDocument);
  const [filePath, setFilePath] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [normalSavedAt, setNormalSavedAt] = useState<string>();
  const [zoom, setZoom] = useState(72);
  const [notice, setNotice] = useState<Notice>();
  const [pageBreakRequest, setPageBreakRequest] = useState(0);
  const [workspaceFocusRequest, setWorkspaceFocusRequest] = useState(0);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [objectSelection, setObjectSelection] = useState<ObjectSelection>();
  const [fontRevision, setFontRevision] = useState(0);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<string>();
  const [pdfError, setPdfError] = useState<string>();
  const [pdfExportJob, setPdfExportJob] = useState<PdfExportJob>();
  const [recoveries, setRecoveries] = useState<RecoveryCandidate[]>([]);
  const bookRef = useRef(book);
  const dirtyRef = useRef(dirty);
  const pdfExportInProgressRef = useRef(false);
  const autosaveInProgressRef = useRef(false);
  const saveInProgressRef = useRef(false);
  const changeRevisionRef = useRef(0);
  const severeErrorHandledRef = useRef(false);
  const graphicHistoryRef = useRef<{ past: GraphicSnapshot[]; future: GraphicSnapshot[] }>({
    past: [],
    future: [],
  });
  const objectClipboardRef = useRef<ObjectClipboard | undefined>(undefined);
  const nativeApi = window.livroStudio;
  const canExportPdf = typeof nativeApi?.exportPdf === "function";
  const measurer = useMemo(() => new CanvasTextMeasurer(), []);
  const story = mainStory(book.stories);
  const layout = useMemo(() => composeStory({
    storyId: story.id,
    content: story.content,
    pageSetup: book.pageSetup,
    styles: book.styles,
    measurer,
    revision: 0,
  }), [book.pageSetup, book.styles, fontRevision, measurer, story.content, story.id]);
  const physicalPages = useMemo(
    () => synchronizePhysicalPages(book.pages, layout.pages.length),
    [book.pages, layout.pages.length],
  );
  const physicalPagesRef = useRef(physicalPages);

  useEffect(() => { bookRef.current = book; }, [book]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { physicalPagesRef.current = physicalPages; }, [physicalPages]);

  useEffect(() => {
    let active = true;
    void document.fonts.ready.then(() => { if (active) setFontRevision((current) => current + 1); });
    return () => { active = false; };
  }, []);

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
    changeRevisionRef.current += 1;
    setBook((current) => {
      const next = { ...updater(current), updatedAt: new Date().toISOString() };
      bookRef.current = next;
      return next;
    });
    setDirty(true);
    setSaveStatus("dirty");
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
    styles: bookRef.current.styles,
  }), []);

  const beginGraphicMutation = useCallback(() => {
    const history = graphicHistoryRef.current;
    history.past.push(graphicSnapshot());
    if (history.past.length > 100) history.past.shift();
    history.future = [];
  }, [graphicSnapshot]);

  const restoreGraphicSnapshot = useCallback((snapshot: GraphicSnapshot) => {
    changeRevisionRef.current += 1;
    setBook((current) => {
      const next = {
        ...current,
        pages: snapshot.pages,
        assets: snapshot.assets,
        guides: snapshot.guides,
        styles: snapshot.styles,
        updatedAt: new Date().toISOString(),
      };
      bookRef.current = next;
      return next;
    });
    setDirty(true);
    setSaveStatus("dirty");
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
          ? {
              ...page,
              objects: [...page.objects, {
                ...duplicate,
                zIndex: Math.max(-1, ...page.objects.map((object) => object.zIndex)) + 1,
              }],
            }
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
    if (!nativeApi || saveInProgressRef.current) return false;
    saveInProgressRef.current = true;
    setSaveStatus("saving");
    const revisionAtStart = changeRevisionRef.current;
    try {
      const currentBook = bookRef.current;
      const savedDocument = {
        ...currentBook,
        pages: physicalPagesRef.current,
        updatedAt: new Date().toISOString(),
      };
      const result = await nativeApi.saveDocument({
        content: serializeDocument(savedDocument),
        filePath: saveAs ? undefined : filePath,
        suggestedName: suggestedFileName(currentBook.title),
      });
      if (result.canceled) {
        setSaveStatus(dirtyRef.current ? "dirty" : "saved");
        return false;
      }
      setFilePath(result.filePath);
      setNormalSavedAt(result.savedAt);
      const savedCurrentRevision = changeRevisionRef.current === revisionAtStart;
      if (savedCurrentRevision) {
        setBook(savedDocument);
        bookRef.current = savedDocument;
        setDirty(false);
        setSaveStatus("saved");
        setNotice(result.warnings?.length
          ? { kind: "warning", text: result.warnings.join(" ") }
          : { kind: "success", text: "Projeto salvo com sucesso." });
      } else {
        setDirty(true);
        setSaveStatus("dirty");
        setNotice({ kind: "warning", text: "A versão iniciada foi salva; alterações feitas durante o salvamento continuam não salvas." });
      }
      return savedCurrentRevision;
    } catch (error) {
      setSaveStatus("error");
      setNotice({ kind: "error", text: userFacingError(error, "Não foi possível salvar o projeto.") });
      return false;
    } finally {
      saveInProgressRef.current = false;
    }
  }, [filePath, nativeApi]);

  const confirmDiscard = useCallback(async (action: string): Promise<boolean> => {
    if (!dirty || !nativeApi) return true;
    const decision = await nativeApi.confirmUnsavedChanges(action);
    if (decision === "cancel") return false;
    return decision !== "save" || saveDocument();
  }, [dirty, nativeApi, saveDocument]);

  const newDocument = useCallback(async () => {
    if (!(await confirmDiscard("criar um novo documento"))) return;
    nativeApi?.beginNewDocument();
    setBook(createDefaultDocument());
    setFilePath(undefined);
    setDirty(false);
    setSaveStatus("saved");
    setNormalSavedAt(undefined);
    setActivePageIndex(0);
    setObjectSelection(undefined);
    graphicHistoryRef.current = { past: [], future: [] };
    changeRevisionRef.current = 0;
    setNotice({ kind: "success", text: "Novo projeto criado." });
  }, [confirmDiscard, nativeApi]);

  const openDocument = useCallback(async () => {
    if (!nativeApi || !(await confirmDiscard("abrir outro documento"))) return;
    try {
      const result = await nativeApi.openDocument();
      if (result.canceled) return;
      const opened = parseDocument(result.content);
      setBook(opened);
      setFilePath(result.filePath);
      setNormalSavedAt(new Date().toISOString());
      setDirty(false);
      setSaveStatus("saved");
      setActivePageIndex(0);
      setObjectSelection(undefined);
      graphicHistoryRef.current = { past: [], future: [] };
      changeRevisionRef.current = 0;
      setNotice(result.warnings.length
        ? { kind: "warning", text: `Projeto aberto com ${result.warnings.length} aviso(s): ${result.warnings.join(" ")}` }
        : { kind: "success", text: result.format === "legacy-json"
          ? "Projeto legado aberto. O próximo salvamento será feito como .livro."
          : "Projeto aberto com sucesso." });
    } catch (error) {
      nativeApi.reportError({
        category: "project-open-renderer",
        message: error instanceof Error ? error.message : "Falha desconhecida ao abrir",
        stack: error instanceof Error ? error.stack : undefined,
      });
      setNotice({ kind: "error", text: userFacingError(error, "Não foi possível abrir o projeto porque o arquivo está inválido ou corrompido.") });
    }
  }, [confirmDiscard, nativeApi]);

  const openExternalDocument = useCallback(async (externalPath: string) => {
    if (!nativeApi || !(await confirmDiscard("abrir o documento solicitado pelo Windows"))) return;
    try {
      const result = await nativeApi.openExternalDocument(externalPath);
      const opened = parseDocument(result.content);
      setBook(opened);
      setFilePath(result.filePath);
      setNormalSavedAt(new Date().toISOString());
      setDirty(false);
      setSaveStatus("saved");
      setActivePageIndex(0);
      setObjectSelection(undefined);
      graphicHistoryRef.current = { past: [], future: [] };
      changeRevisionRef.current = 0;
      setNotice(result.warnings.length
        ? { kind: "warning", text: `Projeto aberto pelo Windows com ${result.warnings.length} aviso(s): ${result.warnings.join(" ")}` }
        : { kind: "success", text: "Projeto aberto pelo Windows com sucesso." });
    } catch (error) {
      nativeApi.reportError({
        category: "project-open-associated-renderer",
        message: error instanceof Error ? error.message : "Falha desconhecida ao abrir associação",
        stack: error instanceof Error ? error.stack : undefined,
      });
      setNotice({ kind: "error", text: userFacingError(error, "Não foi possível abrir o projeto solicitado pelo Windows.") });
    }
  }, [confirmDiscard, nativeApi]);

  const performAutosave = useCallback(async () => {
    if (!nativeApi || !dirtyRef.current || autosaveInProgressRef.current) return;
    autosaveInProgressRef.current = true;
    try {
      const current = bookRef.current;
      const result = await nativeApi.autosaveDocument({
        content: serializeDocument({ ...current, pages: physicalPagesRef.current }),
        filePath,
        normalSavedAt,
      });
      if (!result.skipped && dirtyRef.current) setSaveStatus("autosaved");
    } catch (error) {
      setSaveStatus("error");
      nativeApi.reportError({
        category: "autosave-renderer",
        message: userFacingError(error, "Falha no autosave"),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      autosaveInProgressRef.current = false;
    }
  }, [filePath, nativeApi, normalSavedAt]);

  useEffect(() => {
    if (!dirty) return;
    const timeout = window.setTimeout(() => { void performAutosave(); }, 3000);
    return () => window.clearTimeout(timeout);
  }, [book, dirty, performAutosave]);

  useEffect(() => {
    const interval = window.setInterval(() => { void performAutosave(); }, 30000);
    return () => window.clearInterval(interval);
  }, [performAutosave]);

  useEffect(() => {
    if (!nativeApi) return;
    let active = true;
    void nativeApi.listRecoveries().then((items) => { if (active) setRecoveries(items); })
      .catch((error) => nativeApi.reportError({
        category: "recovery-list",
        message: userFacingError(error, "Falha ao procurar versões de recuperação"),
        stack: error instanceof Error ? error.stack : undefined,
      }));
    return () => { active = false; };
  }, [nativeApi]);

  const recoverAutosave = useCallback(async (candidate: RecoveryCandidate) => {
    if (!nativeApi || !(await confirmDiscard("carregar a versão de recuperação"))) return;
    try {
      const recovered = await nativeApi.loadRecovery(candidate.documentId);
      setBook(parseDocument(recovered.content));
      setFilePath(candidate.sourcePath);
      setDirty(true);
      setSaveStatus("dirty");
      setNormalSavedAt(undefined);
      setActivePageIndex(0);
      setObjectSelection(undefined);
      graphicHistoryRef.current = { past: [], future: [] };
      changeRevisionRef.current = 1;
      await nativeApi.discardRecovery(candidate.documentId);
      setRecoveries((current) => current.filter((item) => item.documentId !== candidate.documentId));
      setNotice({ kind: recovered.warnings.length ? "warning" : "success", text: recovered.warnings.length
        ? `Versão recuperada com ${recovered.warnings.length} aviso(s): ${recovered.warnings.join(" ")}`
        : "Versão de recuperação carregada. Salve para confirmar as alterações." });
    } catch (error) {
      setNotice({ kind: "error", text: userFacingError(error, "Não foi possível carregar a versão de recuperação.") });
    }
  }, [confirmDiscard, nativeApi]);

  const ignoreAutosave = useCallback(async (candidate: RecoveryCandidate) => {
    if (!nativeApi) return;
    try { await nativeApi.discardRecovery(candidate.documentId); }
    catch (error) { nativeApi.reportError({ category: "recovery-discard", message: String(error) }); }
    setRecoveries((current) => current.filter((item) => item.documentId !== candidate.documentId));
  }, [nativeApi]);

  const recoverPreviousVersion = useCallback(async () => {
    if (!nativeApi || !(await confirmDiscard("recuperar uma versão anterior"))) return;
    try {
      const result = await nativeApi.recoverBackup(bookRef.current.id);
      if (result.canceled) {
        if (result.unavailable) setNotice({ kind: "warning", text: "Ainda não há backups anteriores para este projeto." });
        return;
      }
      setBook(parseDocument(result.content));
      setFilePath(undefined);
      setNormalSavedAt(undefined);
      setDirty(true);
      setSaveStatus("dirty");
      setActivePageIndex(0);
      setObjectSelection(undefined);
      graphicHistoryRef.current = { past: [], future: [] };
      changeRevisionRef.current = 1;
      setNotice({ kind: result.warnings.length ? "warning" : "success", text: `Backup de ${new Date(result.backupSavedAt).toLocaleString("pt-BR")} carregado. Use Salvar como para preservá-lo.` });
    } catch (error) {
      setNotice({ kind: "error", text: userFacingError(error, "Não foi possível recuperar o backup.") });
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
      setActivePageIndex(0);
      setObjectSelection(undefined);
      setWorkspaceFocusRequest((current) => current + 1);
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

  const exportPdf = useCallback(async (options: PdfExportOptions) => {
    if (!nativeApi || typeof nativeApi.exportPdf !== "function") {
      setPdfError("A ponte nativa de PDF não está disponível. Reinicie o Livro Studio após recompilar a aplicação.");
      return;
    }
    if (pdfExportInProgressRef.current) return;
    pdfExportInProgressRef.current = true;
    setPdfError(undefined);
    setPdfBusy(true);
    let exportMounted = false;
    try {
      const physicalPageIndexes = options.selection === "all"
        ? physicalPages.map((_, index) => index)
        : parsePhysicalPageRange(options.range, physicalPages.length);
      for (const physicalIndex of physicalPageIndexes) {
        for (const object of physicalPages[physicalIndex]?.objects ?? []) {
          if (object.type !== "image") {
            throw new Error(
              `A página física ${physicalIndex + 1} contém um tipo de objeto ainda não exportável.`,
            );
          }
          const asset = book.assets.find((candidate) => candidate.id === object.assetId);
          if (!asset?.data) {
            throw new Error(
              `A imagem ${object.id} da página física ${physicalIndex + 1} não possui dados incorporados.`,
            );
          }
        }
      }

      const exportId = crypto.randomUUID();
      setPdfProgress("Preparando tipografia, imagens e páginas…");
      setPdfExportJob({
        id: exportId,
        physicalPageIndexes,
        includeBleed: options.includeBleed,
        book,
        pages: physicalPages,
        layout,
      });
      exportMounted = true;
      const exportSurface = await waitForExportSurface(exportId);
      const hasVisibleFolio = physicalPageIndexes.some((physicalIndex) => {
        const folio = resolvePageNumber(
          physicalPages[physicalIndex],
          physicalIndex,
          book.numbering,
        );
        return folio.visible && Boolean(folio.label);
      });
      await validateExportFonts(collectExportFontRequests(
        layout,
        physicalPageIndexes,
        hasVisibleFolio,
      ));
      const serializedSurface = serializePdfExportSurface(exportSurface);
      setPdfExportJob(undefined);
      exportMounted = false;

      const widthMm = book.pageSetup.width + (options.includeBleed
        ? book.pageSetup.bleed.inner + book.pageSetup.bleed.outer
        : 0);
      const heightMm = book.pageSetup.height + (options.includeBleed
        ? book.pageSetup.bleed.top + book.pageSetup.bleed.bottom
        : 0);
      setPdfProgress("Escolha o destino; em seguida o PDF será gerado e gravado com segurança…");
      document.title = `${book.title} — Livro Studio`;
      let result: Awaited<ReturnType<typeof nativeApi.exportPdf>>;
      try {
        result = await nativeApi.exportPdf({
          suggestedName: suggestedPdfFileName(book.title),
          title: book.title,
          widthMm,
          heightMm,
          expectedPageCount: physicalPageIndexes.length,
          cssText: serializedSurface.cssText,
          htmlChunks: serializedSurface.htmlChunks,
          assets: serializedSurface.assets,
        });
      } finally {
        document.title = `${dirtyRef.current ? "• " : ""}${bookRef.current.title} — Livro Studio`;
      }
      if (result.canceled) {
        setPdfProgress(undefined);
        return;
      }
      setPdfDialogOpen(false);
      setNotice({
        kind: "success",
        text: `PDF exportado: ${result.filePath.split(/[\\/]/).at(-1)} (${result.pageCount} página(s)).`,
      });
    } catch (error) {
      setPdfError(userFacingError(error, "Não foi possível exportar o PDF."));
      nativeApi?.reportError({
        category: "pdf-export-renderer",
        message: error instanceof Error ? error.message : "Falha desconhecida no PDF",
        stack: error instanceof Error ? error.stack : undefined,
      });
      setPdfProgress(undefined);
    } finally {
      if (exportMounted) setPdfExportJob(undefined);
      setPdfBusy(false);
      pdfExportInProgressRef.current = false;
    }
  }, [book, layout, nativeApi, physicalPages]);

  useEffect(() => {
    nativeApi?.setDirty(dirty);
    window.document.title = `${dirty ? "• " : ""}${book.title} — Livro Studio`;
  }, [book.title, dirty, nativeApi]);

  useEffect(() => {
    nativeApi?.setOperationBusy(pdfBusy);
    return () => nativeApi?.setOperationBusy(false);
  }, [nativeApi, pdfBusy]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(undefined), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (!(["s", "n", "o"] as string[]).includes(key)) return;
      event.preventDefault();
      if ((saveInProgressRef.current || pdfExportInProgressRef.current) && key !== "s") return;
      if (key === "s") void saveDocument(event.shiftKey);
      else if (key === "n") void newDocument();
      else void openDocument();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [newDocument, openDocument, saveDocument]);

  useEffect(() => {
    if (!nativeApi) return;
    const preserveAndReport = (category: string, error: unknown) => {
      const actual = error instanceof Error ? error : new Error(String(error));
      nativeApi.reportError({ category, message: actual.message, stack: actual.stack });
      if (!severeErrorHandledRef.current) {
        severeErrorHandledRef.current = true;
        void performAutosave().finally(() => { severeErrorHandledRef.current = false; });
      }
      setNotice({ kind: "error", text: "Ocorreu um erro inesperado. O Livro Studio tentou preservar uma versão de recuperação." });
    };
    const onError = (event: ErrorEvent) => preserveAndReport("renderer-error", event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => preserveAndReport("renderer-unhandled-rejection", event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [nativeApi, performAutosave]);

  useEffect(() => nativeApi?.onSaveBeforeClose(() => {
    void saveDocument().then((saved) => nativeApi.finishClose(saved));
  }), [nativeApi, saveDocument]);

  useEffect(() => nativeApi?.onOpenExternalDocument((externalPath) => {
    void openExternalDocument(externalPath);
  }), [nativeApi, openExternalDocument]);

  const valid = isValidPageSetup(book.pageSetup);
  const presetName = book.pageSetup.preset === "custom" ? "Personalizado" : book.pageSetup.preset;
  const fileName = filePath?.split(/[\\/]/).at(-1);

  return (
    <>
      <div className="app-shell">
      <header className="app-bar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span><strong>Livro Studio</strong><small>Edição Windows 1.0</small></span>
        </div>
        <div className="document-name" title={filePath ?? "Documento ainda não salvo"}>
          <span className={`saved-indicator status-${saveStatus} ${dirty ? "dirty" : ""}`} />
          <span>{book.title}{dirty && <span className="dirty-mark" aria-label="Alterações não salvas">●</span>}</span>
          <small className={`save-status save-status-${saveStatus}`}>
            {{ saved: "Salvo", dirty: "Alterações não salvas", saving: "Salvando…", autosaved: "Autosave atualizado", error: "Falha na proteção" }[saveStatus]}
          </small>
        </div>
        <div className="app-actions">
          <button type="button" disabled={pdfBusy || saveStatus === "saving"} onClick={() => void newDocument()}>Novo</button>
          <button type="button" disabled={!nativeApi || pdfBusy || saveStatus === "saving"} onClick={() => void openDocument()}>Abrir projeto</button>
          <button type="button" disabled={!nativeApi || pdfBusy || saveStatus === "saving"} onClick={() => void importManuscript()}>Importar manuscrito</button>
          <button type="button" disabled={!nativeApi || pdfBusy || saveStatus === "saving"} onClick={() => void saveDocument()}>Salvar</button>
          <button className="save-as-button" type="button" disabled={!nativeApi || pdfBusy || saveStatus === "saving"} onClick={() => void saveDocument(true)}>Salvar como</button>
          <button type="button" disabled={!nativeApi || pdfBusy || saveStatus === "saving"} onClick={() => void recoverPreviousVersion()}>Versão anterior</button>
          <button
            className="export-pdf-button"
            type="button"
            disabled={!canExportPdf || !valid || pdfBusy || saveStatus === "saving"}
            title={!canExportPdf
              ? "Reinicie o Livro Studio após recompilar para ativar a ponte nativa de PDF."
              : "Exportar o documento atual como PDF"}
            onClick={() => {
              setPdfError(undefined);
              setPdfProgress(undefined);
              setPdfDialogOpen(true);
            }}
          >Exportar PDF</button>
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
          focusPageRequest={workspaceFocusRequest}
          onStoryChange={updateStory}
          onStylesChange={(styles) => {
            beginGraphicMutation();
            updateStyles(styles);
          }}
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
      {pdfDialogOpen && (
        <PdfExportDialog
          totalPages={physicalPages.length}
          busy={pdfBusy}
          progress={pdfProgress}
          error={pdfError}
          onCancel={() => {
            setPdfDialogOpen(false);
            setPdfError(undefined);
            setPdfProgress(undefined);
          }}
          onExport={(options) => void exportPdf(options)}
        />
      )}
      {recoveries[0] && (
        <div className="recovery-dialog-backdrop" role="presentation">
          <section className="recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
            <span className="eyebrow">Recuperação automática</span>
            <h2 id="recovery-title">Foi encontrada uma versão mais recente</h2>
            <p><strong>{recoveries[0].title}</strong></p>
            <p>Autosave de {new Date(recoveries[0].savedAt).toLocaleString("pt-BR")}.</p>
            <p>O projeto principal não será sobrescrito sem uma ação explícita.</p>
            <div className="recovery-actions">
              <button type="button" onClick={() => void ignoreAutosave(recoveries[0])}>Ignorar</button>
              <button className="primary" type="button" onClick={() => void recoverAutosave(recoveries[0])}>Recuperar</button>
            </div>
          </section>
        </div>
      )}
      <footer className="status-bar">
        <span>{physicalPages.length} {physicalPages.length === 1 ? "página" : "páginas"} · reflow {layout.composeTimeMs.toFixed(1)} ms</span>
        <span>{presetName} · margens {book.pageSetup.mirroredMargins ? "espelhadas" : "fixas"}</span>
        <span>{fileName ?? "Não salvo"} · {{ saved: "Salvo", dirty: "Não salvo", saving: "Salvando…", autosaved: "Recovery atualizado", error: "Proteção com falha" }[saveStatus]} · {nativeApi ? `Desktop · v${nativeApi.version}` : "Preview web"}</span>
      </footer>
      </div>
      {pdfExportJob && (
        <PdfExportDocument
          exportId={pdfExportJob.id}
          book={pdfExportJob.book}
          pages={pdfExportJob.pages}
          layout={pdfExportJob.layout}
          physicalPageIndexes={pdfExportJob.physicalPageIndexes}
          includeBleed={pdfExportJob.includeBleed}
        />
      )}
    </>
  );
}
