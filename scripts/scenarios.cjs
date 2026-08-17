const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outputDirectory = path.join(root, ".tmp");
const screenshotPath = path.join(outputDirectory, "livro-studio-scenarios.png");
const userDataPath = path.join(outputDirectory, "electron-scenarios-user-data");
const persistedPath = path.join(outputDirectory, "scenarios-project.livro.json");
let persistedContent;

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("in-process-gpu");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.setPath("userData", userDataPath);

ipcMain.handle("document:save", async (_event, request) => {
  persistedContent = request.content;
  await fs.writeFile(persistedPath, request.content, "utf8");
  return { canceled: false, filePath: persistedPath };
});
ipcMain.handle("document:open", () => persistedContent
  ? { canceled: false, filePath: persistedPath, content: persistedContent }
  : { canceled: true });
ipcMain.handle("document:confirm-unsaved", () => "discard");
ipcMain.handle("manuscript:confirm-replace", () => true);
ipcMain.handle("manuscript:import", () => ({ canceled: true }));
ipcMain.handle("asset:pick-image", () => ({
  canceled: false,
  image: {
    fileName: "scenario-image.png",
    mimeType: "image/png",
    data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XfJ8WQAAAABJRU5ErkJggg==",
  },
}));
ipcMain.on("document:set-dirty", () => undefined);
ipcMain.on("document:finish-close", () => undefined);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    show: false,
    backgroundColor: "#17201d",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      preload: path.join(root, "dist-electron", "preload.js"),
    },
  });

  await window.loadFile(path.join(root, "dist", "index.html"));
  await new Promise((resolve) => setTimeout(resolve, 300));

  const results = await window.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const setInput = (input, value) => {
      inputSetter.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const button = (label) => [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent.trim() === label);
    const key = (target, value, options = {}) => target.dispatchEvent(new KeyboardEvent('keydown', {
      key: value,
      bubbles: true,
      cancelable: true,
      ...options,
    }));
    const selectObject = async (object) => {
      const box = object.getBoundingClientRect();
      object.setPointerCapture = () => undefined;
      object.releasePointerCapture = () => undefined;
      object.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 111,
        clientX: box.left + 2, clientY: box.top + 2,
      }));
      await wait(25);
      document.querySelector('.positioned-object.selected')?.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, button: 0, pointerId: 111,
        clientX: box.left + 2, clientY: box.top + 2,
      }));
      await wait(35);
    };
    const storyCharacters = () => [...document.querySelectorAll('[data-story-from]')]
      .reduce((total, node) => total + node.textContent.replace(/\u200b/g, '').length, 0);

    const editor = document.querySelector('.story-editor');
    const firstRun = document.querySelector('[data-story-from]');
    const firstNode = firstRun.firstChild;
    const selection = window.getSelection();
    selection.setBaseAndExtent(firstNode, firstNode.textContent.length, firstNode, firstNode.textContent.length);
    editor.focus();
    const longPaste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(longPaste, 'clipboardData', {
      value: { getData: () => ' texto contínuo para cenário'.repeat(950) }
    });
    editor.dispatchEvent(longPaste);
    await wait(550);
    const longPageCount = document.querySelectorAll('.trim-page').length;

    const goTo = document.querySelector('input[aria-label="Ir para página física"]');
    setInput(goTo, 5);
    button('Ir').click();
    await wait(80);
    button('Inserir imagem').click();
    await wait(180);
    const insertedPage = Number(document.querySelector('.positioned-object.selected').closest('.page-shell').dataset.pageIndex);
    const activeAfterInsert = Number(document.querySelector('.active-page').dataset.pageIndex);
    setInput(document.querySelector('input[aria-label="X em milímetros"]'), -3);
    setInput(document.querySelector('input[aria-label="Y em milímetros"]'), -2.5);
    setInput(document.querySelector('.object-properties input[aria-label="Largura em milímetros"]'), 30);
    await wait(80);
    const documentXBeforeZoom = Number(document.querySelector('input[aria-label="X em milímetros"]').value);
    const zoomInput = document.querySelector('input[aria-label="Zoom"]');
    setInput(zoomInput, 25);
    await wait(100);
    const widthAt25 = document.querySelector('.positioned-object.selected').getBoundingClientRect().width;
    const documentXAt25 = Number(document.querySelector('input[aria-label="X em milímetros"]').value);
    setInput(zoomInput, 200);
    await wait(120);
    const widthAt200 = document.querySelector('.positioned-object.selected').getBoundingClientRect().width;
    const documentXAt200 = Number(document.querySelector('input[aria-label="X em milímetros"]').value);
    setInput(zoomInput, 72);
    await wait(100);

    let selected = document.querySelector('.positioned-object.selected');
    selected.focus();
    const xBeforeArrow = Number(document.querySelector('input[aria-label="X em milímetros"]').value);
    key(selected, 'ArrowRight');
    await wait(50);
    const xAfterArrow = Number(document.querySelector('input[aria-label="X em milímetros"]').value);
    selected = document.querySelector('.positioned-object.selected');
    const yBeforeShiftArrow = Number(document.querySelector('input[aria-label="Y em milímetros"]').value);
    key(selected, 'ArrowDown', { shiftKey: true });
    await wait(50);
    const yAfterShiftArrow = Number(document.querySelector('input[aria-label="Y em milímetros"]').value);
    selected = document.querySelector('.positioned-object.selected');
    key(selected, 'z', { ctrlKey: true });
    await wait(60);
    const yAfterObjectUndo = Number(document.querySelector('input[aria-label="Y em milímetros"]').value);
    selected = document.querySelector('.positioned-object.selected');
    key(selected, 'y', { ctrlKey: true });
    await wait(60);
    const yAfterObjectRedo = Number(document.querySelector('input[aria-label="Y em milímetros"]').value);

    selected = document.querySelector('.positioned-object.selected');
    key(selected, 'd', { ctrlKey: true });
    await wait(70);
    const afterDuplicate = document.querySelectorAll('.positioned-object').length;
    selected = document.querySelector('.positioned-object.selected');
    selected.dispatchEvent(new Event('copy', { bubbles: true, cancelable: true }));
    selected.dispatchEvent(new Event('paste', { bubbles: true, cancelable: true }));
    await wait(70);
    const afterCopyPaste = document.querySelectorAll('.positioned-object').length;

    selected = document.querySelector('.positioned-object.selected');
    key(selected, 'Delete');
    await wait(70);
    const afterDelete = document.querySelectorAll('.positioned-object').length;
    key(document.body, 'z', { ctrlKey: true });
    await wait(70);
    const afterGlobalUndoDelete = document.querySelectorAll('.positioned-object').length;
    key(document.body, 'y', { ctrlKey: true });
    await wait(70);
    const afterGlobalRedoDelete = document.querySelectorAll('.positioned-object').length;

    await selectObject(document.querySelector('.positioned-object'));
    selected = document.querySelector('.positioned-object.selected');
    selected.dispatchEvent(new Event('copy', { bubbles: true, cancelable: true }));
    key(selected, 'Delete');
    await wait(60);
    const beforePasteWithoutSelection = document.querySelectorAll('.positioned-object').length;
    key(document.body, 'v', { ctrlKey: true });
    await wait(80);
    const afterPasteWithoutSelection = document.querySelectorAll('.positioned-object').length;

    button('+ Vertical').click();
    button('+ Horizontal').click();
    await wait(60);
    const verticalGuide = document.querySelector('input[aria-label^="Posição da guia vertical"]');
    const horizontalGuide = document.querySelector('input[aria-label^="Posição da guia horizontal"]');
    setInput(verticalGuide, 27.5);
    setInput(horizontalGuide, -3);
    await wait(70);

    button('Página única').click();
    await wait(80);
    const singlePageCount = document.querySelectorAll('.trim-page').length;
    const singlePageIndex = Number(document.querySelector('.active-page').dataset.pageIndex);
    document.querySelector('button[aria-label="Próxima página"]').click();
    await wait(60);
    const nextSinglePageIndex = Number(document.querySelector('.active-page').dataset.pageIndex);
    button('Spread').click();
    await wait(100);

    const objectsBeforeTextUndo = document.querySelectorAll('.positioned-object').length;
    const textRun = document.querySelector('[data-story-from]');
    const textNode = textRun.firstChild;
    selection.setBaseAndExtent(textNode, textNode.textContent.length, textNode, textNode.textContent.length);
    editor.focus();
    const charactersBeforeTextEdit = storyCharacters();
    const textPaste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(textPaste, 'clipboardData', { value: { getData: () => 'XYZ' } });
    editor.dispatchEvent(textPaste);
    await wait(70);
    const charactersAfterTextEdit = storyCharacters();
    key(editor, 'z', { ctrlKey: true });
    await wait(80);
    const charactersAfterTextUndo = storyCharacters();
    const objectsAfterTextUndo = document.querySelectorAll('.positioned-object').length;

    const currentRun = document.querySelector('[data-story-from]');
    selection.setBaseAndExtent(currentRun.firstChild, 0, currentRun.firstChild, 0);
    editor.focus();
    key(editor, 'a', { ctrlKey: true });
    const shortPaste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(shortPaste, 'clipboardData', { value: { getData: () => 'Texto curto.' } });
    editor.dispatchEvent(shortPaste);
    await wait(500);
    const pagesAfterShrink = document.querySelectorAll('.trim-page').length;
    const remainingObjectPages = [...document.querySelectorAll('.positioned-object')]
      .map((object) => Number(object.closest('.page-shell').dataset.pageIndex));

    button('Salvar').click();
    await wait(160);
    const dirtyAfterSave = document.querySelector('.saved-indicator.dirty') !== null;
    button('Abrir projeto').click();
    await wait(300);

    return {
      longPageCount,
      insertedPage,
      activeAfterInsert,
      documentXBeforeZoom,
      documentXAt25,
      documentXAt200,
      widthAt25,
      widthAt200,
      xBeforeArrow,
      xAfterArrow,
      yBeforeShiftArrow,
      yAfterShiftArrow,
      yAfterObjectUndo,
      yAfterObjectRedo,
      afterDuplicate,
      afterCopyPaste,
      afterDelete,
      afterGlobalUndoDelete,
      afterGlobalRedoDelete,
      beforePasteWithoutSelection,
      afterPasteWithoutSelection,
      guideInputs: document.querySelectorAll('input[aria-label^="Posição da guia"]').length,
      guideLines: document.querySelectorAll('.custom-guide').length,
      singlePageCount,
      singlePageIndex,
      nextSinglePageIndex,
      charactersBeforeTextEdit,
      charactersAfterTextEdit,
      charactersAfterTextUndo,
      objectsBeforeTextUndo,
      objectsAfterTextUndo,
      pagesAfterShrink,
      remainingObjectPages,
      dirtyAfterSave,
      reopenedPageCount: document.querySelectorAll('.trim-page').length,
      reopenedStoryCharacters: storyCharacters(),
      reopenedObjects: document.querySelectorAll('.positioned-object').length,
      reopenedEmbeddedImages: document.querySelectorAll('.positioned-object img[src^="data:image/png;base64,"]').length,
    };
  })()`);

  const persistedDocument = persistedContent ? JSON.parse(persistedContent) : undefined;
  const persistedObjects = persistedDocument?.pages?.[4]?.objects ?? [];
  const persistedZOrder = persistedObjects.map((object) => object.zIndex);
  console.log(JSON.stringify({
    results,
    persisted: {
      assets: persistedDocument?.assets?.length,
      objectsOnPageFive: persistedObjects.length,
      zOrder: persistedZOrder,
      guides: persistedDocument?.guides?.map((guide) => ({
        orientation: guide.orientation,
        positionMm: guide.positionMm,
      })),
    },
    persistedPath,
    screenshotPath,
  }, null, 2));

  assert(results.longPageCount >= 8, "The long story did not create enough pages.");
  assert(results.insertedPage === 4 && results.activeAfterInsert === 4, "Insertion did not use the active physical page.");
  assert(
    results.documentXBeforeZoom === results.documentXAt25 && results.documentXAt25 === results.documentXAt200,
    "Changing zoom changed the persisted millimeter coordinate.",
  );
  assert(Math.abs(results.widthAt200 / results.widthAt25 - 8) < 0.05, "Object screen projection did not scale proportionally from 25% to 200%.");
  assert(Math.abs(results.xAfterArrow - results.xBeforeArrow - 0.5) < 0.001, "Arrow nudge was not 0.5 mm.");
  assert(Math.abs(results.yAfterShiftArrow - results.yBeforeShiftArrow - 5) < 0.001, "Shift+Arrow nudge was not 5 mm.");
  assert(Math.abs(results.yAfterObjectUndo - results.yBeforeShiftArrow) < 0.001, "Object undo did not restore the previous position.");
  assert(Math.abs(results.yAfterObjectRedo - results.yAfterShiftArrow) < 0.001, "Object redo did not restore the movement.");
  assert(results.afterDuplicate === 2 && results.afterCopyPaste === 3, "Duplicate or object copy/paste failed.");
  assert(results.afterDelete === 2 && results.afterGlobalUndoDelete === 3, "Deleting an object could not be undone after selection disappeared.");
  assert(results.afterGlobalRedoDelete === 2, "Global graphic redo did not reapply deletion.");
  assert(results.afterPasteWithoutSelection === results.beforePasteWithoutSelection + 1, "Copied object could not be pasted after deleting the selected instance.");
  assert(results.guideInputs === 2 && results.guideLines >= results.pagesAfterShrink * 2, "Global guides were not preserved across pages.");
  assert(results.singlePageCount === 1 && results.nextSinglePageIndex === results.singlePageIndex + 1, "Single-page navigation failed.");
  assert(results.charactersAfterTextEdit === results.charactersBeforeTextEdit + 3, "Text insertion failed in the mixed document.");
  assert(results.charactersAfterTextUndo === results.charactersBeforeTextEdit, "Text undo did not remain independent.");
  assert(results.objectsAfterTextUndo === results.objectsBeforeTextUndo, "Text undo changed positioned objects.");
  assert(results.pagesAfterShrink >= 5 && results.remainingObjectPages.every((page) => page === 4), "Reflow moved or removed page-fixed objects.");
  assert(!results.dirtyAfterSave, "Save did not clear dirty state.");
  assert(results.reopenedPageCount === 5 && results.reopenedStoryCharacters === 12, "The shortened story did not reopen with its saved pagination.");
  assert(results.reopenedObjects === results.remainingObjectPages.length, "Objects did not survive save/open.");
  assert(results.reopenedEmbeddedImages === results.reopenedObjects, "Embedded assets did not survive save/open.");
  assert(persistedContent && JSON.parse(persistedContent).schemaVersion === 3, "Scenario project did not persist schema 3.");
  assert(persistedDocument.assets.length === 1, "Copies of the same image duplicated its embedded asset.");
  assert(new Set(persistedZOrder).size === persistedZOrder.length, "Object copy/paste created duplicate z-index values after a deletion gap.");
  assert(
    persistedDocument.guides.some((guide) => guide.orientation === "vertical" && guide.positionMm === 27.5)
      && persistedDocument.guides.some((guide) => guide.orientation === "horizontal" && guide.positionMm === -3),
    "Edited guide positions did not persist.",
  );

  await fs.mkdir(outputDirectory, { recursive: true });
  window.show();
  window.focus();
  window.webContents.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const screenshot = await window.webContents.capturePage();
  await fs.writeFile(screenshotPath, screenshot.toPNG());
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
