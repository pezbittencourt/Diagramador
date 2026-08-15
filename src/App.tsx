import { useCallback, useEffect, useMemo, useState } from "react";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { Workspace } from "./components/Workspace";
import { createDefaultDocument } from "./domain/defaultDocument";
import type {
  BookDocument,
  PageNumbering,
  PageSetup,
  ParagraphStyle,
  RichTextDocument,
} from "./domain/document";
import { isValidPageSetup } from "./domain/pageGeometry";
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

  useEffect(() => {
    if (book.pages.length === physicalPages.length &&
        book.pages.every((page, index) => page === physicalPages[index])) return;
    setBook((current) => ({ ...current, pages: physicalPages }));
  }, [book.pages, physicalPages]);

  const updateBook = useCallback((updater: (current: BookDocument) => BookDocument) => {
    setBook((current) => ({ ...updater(current), updatedAt: new Date().toISOString() }));
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
      setNotice({ kind: "success", text: "Projeto aberto com sucesso." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Não foi possível abrir o projeto." });
    }
  }, [confirmDiscard, nativeApi]);

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
          <span><strong>Livro Studio</strong><small>rich text 0.5</small></span>
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
          onSetupChange={updatePageSetup}
          onNumberingChange={updateNumbering}
          onShowMarginsChange={(showMargins) => updateBook((current) => ({ ...current, viewSettings: { ...current.viewSettings, showMargins } }))}
          onShowBleedChange={(showBleed) => updateBook((current) => ({ ...current, viewSettings: { ...current.viewSettings, showBleed } }))}
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
          pageBreakRequest={pageBreakRequest}
          onStoryChange={updateStory}
          onStylesChange={updateStyles}
          onInsertPageBreak={() => setPageBreakRequest((current) => current + 1)}
          onZoomChange={setZoom}
        />
      </div>
      {!valid && <div className="validation-banner" role="alert">As margens precisam caber dentro da página e todos os valores devem ser positivos.</div>}
      {notice && <div className={`operation-notice notice-${notice.kind}`} role="status">{notice.text}</div>}
      <footer className="status-bar">
        <span>{layout.pages.length} {layout.pages.length === 1 ? "página" : "páginas"} · reflow {layout.composeTimeMs.toFixed(1)} ms</span>
        <span>{presetName} · margens {book.pageSetup.mirroredMargins ? "espelhadas" : "fixas"}</span>
        <span>{fileName ?? "Não salvo"} · {nativeApi ? `Desktop · v${nativeApi.version}` : "Preview web"}</span>
      </footer>
    </div>
  );
}
