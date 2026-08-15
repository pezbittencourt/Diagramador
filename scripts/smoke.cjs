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
    const firstParagraphStyle = getComputedStyle(reopenedRun.closest('.story-fragment'));
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
      justified: firstParagraphStyle.textAlign === 'justify',
      selectedStyle: document.querySelector('select[aria-label="Estilo de parágrafo"]').value,
      dualSpreadCount: dualSpreads.length,
      gaps,
      firstOffset,
      firstPageWidth: rect(firstPage).width,
      marginGeometry,
      folios,
      canScrollHorizontally: viewport.scrollWidth > viewport.clientWidth,
      canScrollVertically: viewport.scrollHeight > viewport.clientHeight,
      storyCharacters: [...document.querySelectorAll('[data-story-from]')]
        .reduce((total, node) => total + node.textContent.replace(/\u200b/g, '').length, 0),
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
  assert(interactions.canScrollHorizontally && interactions.canScrollVertically, "Canvas scrolling regressed at high zoom.");
  assert(interactions.storyCharacters > 30000, "Inserted manuscript text was lost.");
  assert(persistedContent && JSON.parse(persistedContent).schemaVersion === 2, "Smoke project was not persisted with schema 2.");

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
