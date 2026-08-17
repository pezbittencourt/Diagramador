const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outputDirectory = path.join(root, ".tmp");
const screenshotPath = path.join(outputDirectory, "livro-studio-smoke.png");
const userDataPath = path.join(outputDirectory, "electron-smoke-user-data");
const persistedPath = path.join(outputDirectory, "smoke-project.livro.json");
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
    fileName: "smoke-image.png",
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
  await new Promise((resolve) => setTimeout(resolve, 350));

  const initial = await window.webContents.executeJavaScript(`(() => ({
    title: document.title,
    pages: document.querySelectorAll('.trim-page').length,
    styles: [...document.querySelectorAll('select[aria-label="Estilo de parágrafo"] option')].map((option) => option.textContent),
    toolbar: document.querySelector('.format-toolbar') !== null,
    bodyText: document.body.innerText
  }))()`);

  assert(initial.title.includes("Livro Studio"), "Window title is incorrect.");
  assert(initial.pages >= 1, "At least one composed page should be visible.");
  assert(initial.toolbar, "Rich-text toolbar is missing.");
  assert(initial.styles.includes("Título de capítulo") && initial.styles.includes("Dedicatória"), "Default editorial styles are missing.");

  const interactions = await window.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    const setInput = (input, value) => {
      inputSetter.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const setSelect = (select, value) => {
      selectSetter.call(select, value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const button = (label) => [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent.trim() === label);
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
    };

    const editor = document.querySelector('.story-editor');
    const initialRun = document.querySelector('[data-story-from]');
    const initialNode = initialRun.firstChild;
    const selection = window.getSelection();
    selection.setBaseAndExtent(initialNode, initialNode.textContent.length, initialNode, initialNode.textContent.length);
    editor.focus();
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { getData: () => ' ' + 'texto para paginação editorial '.repeat(1200) }
    });
    editor.dispatchEvent(pasteEvent);
    await wait(600);
    const pagesAfterWrite = document.querySelectorAll('.trim-page').length;

    const firstRun = document.querySelector('[data-story-from="0"]');
    const firstNode = firstRun.firstChild;
    selection.setBaseAndExtent(firstNode, 0, firstNode, Math.min(6, firstNode.textContent.length));
    document.querySelector('button[aria-label="Negrito"]').click();
    await wait(60);
    document.querySelector('button[aria-label="Itálico"]').click();
    await wait(60);
    setInput(document.querySelector('input[aria-label="Tamanho da fonte"]'), 16);
    await wait(120);
    document.querySelector('button[aria-label="Justificar"]').click();
    await wait(80);
    const styleSelect = document.querySelector('select[aria-label="Estilo de parágrafo"]');
    setSelect(styleSelect, 'chapter-title');
    await wait(350);
    const pagesAfterStyle = document.querySelectorAll('.trim-page').length;

    button('Editar estilos').click();
    await wait(80);
    [...document.querySelectorAll('.style-editor nav button')]
      .find((candidate) => candidate.textContent.includes('Título de capítulo')).click();
    await wait(40);
    setInput(document.querySelector('input[aria-label="Tamanho do estilo"]'), 24);
    await wait(350);
    const pagesAfterGlobalStyle = document.querySelectorAll('.trim-page').length;
    button('Salvar e fechar').click();

    const marginToggle = document.querySelectorAll('.check-row input')[0];
    marginToggle.click();
    await wait(40);
    const hiddenMargins = document.querySelectorAll('.margin-guide').length;
    marginToggle.click();

    setSelect(document.querySelector('select[aria-label^="Predefinição"]'), 'A4');
    setInput(document.querySelector('input[aria-label="Zoom"]'), 150);
    setInput(document.querySelector('input[aria-label*="física inicial"]'), 1);
    await wait(450);

    button('Inserir imagem').click();
    await wait(180);
    const imageInserted = document.querySelectorAll('.positioned-object').length;
    const imageSelected = document.querySelector('.positioned-object.selected') !== null;
    const activePageAfterSelection = Number(document.querySelector('.active-page').dataset.pageIndex);
    const selectedObjectPage = Number(document.querySelector('.positioned-object.selected').closest('.page-shell').dataset.pageIndex);
    setInput(document.querySelector('.object-properties input[aria-label="Largura em milímetros"]'), 40);
    setInput(document.querySelector('input[aria-label="X em milímetros"]'), -3);
    setInput(document.querySelector('input[aria-label="Y em milímetros"]'), 12);
    await wait(100);
    const resizeHandle = document.querySelector('.positioned-object.selected .resize-se');
    const resizeBox = resizeHandle.getBoundingClientRect();
    resizeHandle.setPointerCapture = () => undefined;
    resizeHandle.releasePointerCapture = () => undefined;
    resizeHandle.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 61,
      clientX: resizeBox.left, clientY: resizeBox.top,
    }));
    await wait(30);
    const activeResizeHandle = document.querySelector('.positioned-object.selected .resize-se');
    activeResizeHandle.setPointerCapture = () => undefined;
    activeResizeHandle.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, buttons: 1, pointerId: 61,
      clientX: resizeBox.left + 15, clientY: resizeBox.top + 15,
    }));
    await wait(30);
    document.querySelector('.positioned-object.selected .resize-se').dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, button: 0, pointerId: 61,
      clientX: resizeBox.left + 15, clientY: resizeBox.top + 15,
    }));
    await wait(80);
    const widthAfterHandleResize = Number(document.querySelector('.object-properties input[aria-label="Largura em milímetros"]').value);
    const imageBeforeDrag = document.querySelector('.positioned-object.selected');
    const dragBox = imageBeforeDrag.getBoundingClientRect();
    imageBeforeDrag.setPointerCapture = () => undefined;
    imageBeforeDrag.releasePointerCapture = () => undefined;
    imageBeforeDrag.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 71,
      clientX: dragBox.left + 10, clientY: dragBox.top + 10,
    }));
    await wait(30);
    const imageDuringDrag = document.querySelector('.positioned-object.selected');
    imageDuringDrag.setPointerCapture = () => undefined;
    imageDuringDrag.releasePointerCapture = () => undefined;
    imageDuringDrag.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, buttons: 1, pointerId: 71,
      clientX: dragBox.left + 28, clientY: dragBox.top + 22,
    }));
    await wait(30);
    const imageAfterMove = document.querySelector('.positioned-object.selected');
    imageAfterMove.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, button: 0, pointerId: 71,
      clientX: dragBox.left + 28, clientY: dragBox.top + 22,
    }));
    await wait(120);
    const draggedX = Number(document.querySelector('input[aria-label="X em milímetros"]').value);
    const draggedY = Number(document.querySelector('input[aria-label="Y em milímetros"]').value);

    button('Duplicar').click();
    await wait(80);
    const objectsAfterDuplicate = document.querySelectorAll('.positioned-object').length;
    button('Fundo').click();
    button('+ Vertical').click();
    await wait(80);
    const guidePosition = document.querySelector('input[aria-label^="Posição da guia vertical"]');
    setInput(guidePosition, 35);
    await wait(80);
    const customGuides = document.querySelectorAll('.custom-guide-vertical').length;
    setInput(document.querySelector('input[aria-label="X em milímetros"]'), 34.5);
    await wait(40);
    const snapObject = document.querySelector('.positioned-object.selected');
    const snapBox = snapObject.getBoundingClientRect();
    snapObject.setPointerCapture = () => undefined;
    snapObject.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 81,
      clientX: snapBox.left + 10, clientY: snapBox.top + 10,
    }));
    await wait(30);
    const activeSnapObject = document.querySelector('.positioned-object.selected');
    activeSnapObject.setPointerCapture = () => undefined;
    activeSnapObject.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, buttons: 1, pointerId: 81,
      clientX: snapBox.left + 11, clientY: snapBox.top + 10,
    }));
    await wait(30);
    document.querySelector('.positioned-object.selected').dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, button: 0, pointerId: 81,
      clientX: snapBox.left + 11, clientY: snapBox.top + 10,
    }));
    await wait(80);
    const snappedGuideX = Number(document.querySelector('input[aria-label="X em milímetros"]').value);

    button('Página única').click();
    await wait(100);
    const singleModePages = document.querySelectorAll('.trim-page').length;
    document.querySelector('button[aria-label="Próxima página"]').click();
    await wait(80);
    const activeSinglePage = Number(document.querySelector('.active-page').dataset.pageIndex);
    button('Spread').click();
    await wait(120);

    const objectPageBeforeReflow = Number(document.querySelector('.positioned-object').closest('.page-shell').dataset.pageIndex);
    const reflowRuns = document.querySelectorAll('[data-story-from]');
    const reflowRun = reflowRuns[reflowRuns.length - 1];
    const reflowNode = reflowRun.firstChild;
    selection.setBaseAndExtent(reflowNode, reflowNode.textContent.length, reflowNode, reflowNode.textContent.length);
    editor.focus();
    const reflowPaste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(reflowPaste, 'clipboardData', {
      value: { getData: () => 'conteúdo para reflow '.repeat(350) }
    });
    editor.dispatchEvent(reflowPaste);
    await wait(450);
    const objectPageAfterReflow = Number(document.querySelector('.positioned-object').closest('.page-shell').dataset.pageIndex);

    const pagesBeforeSave = document.querySelectorAll('.trim-page').length;
    button('Salvar').click();
    await wait(180);
    const dirtyAfterSave = document.querySelector('.saved-indicator.dirty') !== null;
    button('Abrir projeto').click();
    await wait(450);

    const reopenedPages = document.querySelectorAll('.trim-page').length;
    const reopenedRun = document.querySelector('[data-story-from="0"]');
    const reopenedRunStyle = getComputedStyle(reopenedRun);
    const followingRun = reopenedRun.parentElement.querySelectorAll('[data-story-from]')[1];
    const followingStyle = followingRun ? getComputedStyle(followingRun) : reopenedRunStyle;
    const firstParagraph = reopenedRun.closest('.story-fragment');
    const dualSpreads = [...document.querySelectorAll('.spread')]
      .filter((spread) => spread.querySelectorAll('.page-shell').length === 2);
    const gaps = dualSpreads.map((spread) => {
      const pages = [...spread.querySelectorAll('.page-shell')].map(rect);
      return { gap: pages[1].left - pages[0].right, topDelta: Math.abs(pages[1].top - pages[0].top) };
    });
    const firstSpread = document.querySelector('.spread');
    const firstPage = firstSpread.querySelector('.page-shell');
    const firstOffset = rect(firstPage).left - rect(firstSpread).left;
    const firstDualPages = dualSpreads[0] ? [...dualSpreads[0].querySelectorAll('.page-shell')] : [];
    const marginGeometry = firstDualPages.map((page) => {
      const trim = rect(page.querySelector('.trim-page'));
      const guide = rect(page.querySelector('.margin-guide'));
      return { left: guide.left - trim.left, right: trim.right - guide.right };
    });
    const viewport = document.querySelector('.canvas-viewport');
    const folios = [...document.querySelectorAll('.editorial-folio')].map((node) => node.textContent);
    const textBounds = [...document.querySelectorAll('.page-shell')].map((page) => {
      const trim = rect(page.querySelector('.trim-page'));
      const marginGuide = rect(page.querySelector('.margin-guide'));
      const lineElements = [...page.querySelectorAll('.composed-text-line')]
        .filter((line) => line.textContent.replace(/\u200b/g, '').length);
      const lines = lineElements.map(rect);
      return {
        page: Number(page.dataset.pageIndex) + 1,
        trimTop: trim.top,
        trimBottom: trim.bottom,
        marginTop: marginGuide.top,
        marginBottom: marginGuide.bottom,
        firstTop: lines[0]?.top,
        lastBottom: lines.at(-1)?.bottom,
        layerScrollTop: lineElements[0]?.closest('.editorial-text-layer')?.scrollTop,
        trimScrollTop: page.querySelector('.trim-page').scrollTop,
      };
    });

    return {
      pagesAfterWrite,
      pagesAfterStyle,
      pagesAfterGlobalStyle,
      pagesBeforeSave,
      reopenedPages,
      hiddenMargins,
      restoredMargins: document.querySelectorAll('.margin-guide').length,
      dirtyAfterSave,
      dirtyAfterOpen: document.querySelector('.saved-indicator.dirty') !== null,
      inlineBold: Number(reopenedRunStyle.fontWeight) >= 600,
      inlineItalic: reopenedRunStyle.fontStyle === 'italic',
      inlineSizePx: Number.parseFloat(reopenedRunStyle.fontSize),
      inheritedSizePx: Number.parseFloat(followingStyle.fontSize),
      justified: firstParagraph.dataset.paragraphAlignment === 'justify',
      selectedStyle: document.querySelector('select[aria-label="Estilo de parágrafo"]').value,
      dualSpreadCount: dualSpreads.length,
      gaps,
      firstOffset,
      firstPageWidth: rect(firstPage).width,
      marginGeometry,
      folios,
      textBounds,
      canScrollHorizontally: viewport.scrollWidth > viewport.clientWidth,
      canScrollVertically: viewport.scrollHeight > viewport.clientHeight,
      storyCharacters: [...document.querySelectorAll('[data-story-from]')]
        .reduce((total, node) => total + node.textContent.replace(/\u200b/g, '').length, 0),
      imageInserted,
      imageSelected,
      activePageAfterSelection,
      selectedObjectPage,
      draggedX,
      draggedY,
      widthAfterHandleResize,
      snappedGuideX,
      objectsAfterDuplicate,
      reopenedObjects: document.querySelectorAll('.positioned-object').length,
      embeddedImages: document.querySelectorAll('.positioned-object img[src^="data:image/png;base64,"]').length,
      customGuides,
      reopenedGuideInputs: document.querySelectorAll('input[aria-label^="Posição da guia"]').length,
      singleModePages,
      activeSinglePage,
      objectPageBeforeReflow,
      objectPageAfterReflow,
    };
  })()`);

  assert(interactions.pagesAfterWrite > 2, "Large text did not create additional pages.");
  assert(interactions.pagesAfterStyle !== interactions.pagesAfterWrite, "Applying a paragraph style did not reflow.");
  assert(interactions.pagesAfterGlobalStyle !== interactions.pagesAfterStyle, "Editing a global style did not reflow linked paragraphs.");
  assert(interactions.hiddenMargins === 0, "Could not hide margins.");
  assert(interactions.restoredMargins === interactions.reopenedPages, "Could not restore margins.");
  assert(!interactions.dirtyAfterSave && !interactions.dirtyAfterOpen, "Save/open did not clear dirty state.");
  assert(interactions.reopenedPages === interactions.pagesBeforeSave, "Save/open changed pagination.");
  assert(interactions.inlineBold && interactions.inlineItalic, "Inline emphasis did not survive save/open.");
  assert(interactions.inheritedSizePx > interactions.inlineSizePx, "Inline font-size override did not survive the global style change.");
  assert(interactions.justified, "Paragraph justification did not survive save/open.");
  assert(interactions.selectedStyle === "chapter-title", "Paragraph style link did not survive save/open.");
  assert(interactions.dualSpreadCount > 0, "No two-page spreads were rendered.");
  assert(interactions.gaps.every((item) => item.gap > 0 && item.topDelta < 0.5), "Facing pages are not aligned side by side.");
  assert(Math.max(...interactions.gaps.map((item) => item.gap)) - Math.min(...interactions.gaps.map((item) => item.gap)) < 0.5, "Spread gaps are inconsistent.");
  assert(interactions.firstOffset > interactions.firstPageWidth, "The isolated first page is not in the right-hand slot.");
  assert(interactions.marginGeometry[0].right > interactions.marginGeometry[0].left, "Left-page inner margin is not facing the spine.");
  assert(interactions.marginGeometry[1].left > interactions.marginGeometry[1].right, "Right-page inner margin is not facing the spine.");
  assert(interactions.folios.includes("3"), "Editorial numbering did not follow rich-text reflow.");
  assert(interactions.textBounds.every((page) => page.firstTop === undefined
    || (page.firstTop >= page.marginTop - 1 && page.lastBottom <= page.marginBottom + 1)),
    `Composed text escaped its usable margin box: ${JSON.stringify(interactions.textBounds.filter((page) =>
      page.firstTop !== undefined
        && (page.firstTop < page.marginTop - 1 || page.lastBottom > page.marginBottom + 1)).slice(0, 3))}`);
  assert(interactions.textBounds.every((page) => page.layerScrollTop === 0 && page.trimScrollTop === 0),
    `An editorial page accumulated internal scroll: ${JSON.stringify(interactions.textBounds
      .filter((page) => page.layerScrollTop !== 0 || page.trimScrollTop !== 0).slice(0, 3))}`);
  assert(interactions.canScrollHorizontally && interactions.canScrollVertically, "Canvas scrolling regressed at high zoom.");
  assert(interactions.storyCharacters > 30000, "Inserted manuscript text was lost.");
  assert(interactions.imageInserted === 1 && interactions.imageSelected, "Image insertion/selection failed.");
  assert(interactions.activePageAfterSelection === interactions.selectedObjectPage, "Selecting an object did not activate its page.");
  assert(interactions.draggedX !== -3 && interactions.draggedY !== 12, "Image drag did not update mm coordinates.");
  assert(interactions.widthAfterHandleResize > 40, "Image resize handle did not update its size.");
  assert(interactions.snappedGuideX === 35, "Image did not snap to the custom guide.");
  assert(interactions.objectsAfterDuplicate === 2 && interactions.reopenedObjects === 2, "Image duplication did not survive save/open.");
  assert(interactions.embeddedImages === 2, "Embedded image assets did not reopen.");
  assert(interactions.customGuides > 0 && interactions.reopenedGuideInputs === 1, "Custom guide did not survive save/open.");
  assert(interactions.singleModePages === 1 && interactions.activeSinglePage === 1, "Single-page navigation failed.");
  assert(interactions.objectPageAfterReflow === interactions.objectPageBeforeReflow, "Text reflow moved a page-fixed object.");
  assert(persistedContent && JSON.parse(persistedContent).schemaVersion === 3, "Smoke project was not persisted with schema 3.");

  await window.webContents.executeJavaScript(`(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const zoom = document.querySelector('input[aria-label="Zoom"]');
    setter.call(zoom, '45');
    zoom.dispatchEvent(new Event('input', { bubbles: true }));
    zoom.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const viewport = document.querySelector('.canvas-viewport');
    const secondSpread = document.querySelectorAll('.spread-unit')[1];
    if (viewport && secondSpread) {
      viewport.scrollTop = Math.max(0, secondSpread.offsetTop - 24);
      viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  })()`);
  await fs.mkdir(outputDirectory, { recursive: true });
  const screenshot = await window.webContents.capturePage();
  await fs.writeFile(screenshotPath, screenshot.toPNG());
  console.log(JSON.stringify({ screenshotPath, persistedPath, initial, interactions }, null, 2));
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
