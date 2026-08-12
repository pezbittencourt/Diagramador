const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outputDirectory = path.join(root, ".tmp");
const screenshotPath = path.join(outputDirectory, "livro-studio-smoke.png");
const userDataPath = path.join(outputDirectory, "electron-smoke-user-data");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("in-process-gpu");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.setPath("userData", userDataPath);

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
    },
  });

  await window.loadFile(path.join(root, "dist", "index.html"));
  await new Promise((resolve) => setTimeout(resolve, 300));

  const initial = await window.webContents.executeJavaScript(`(() => ({
    title: document.title,
    pages: document.querySelectorAll('.trim-page').length,
    margins: document.querySelectorAll('.margin-guide').length,
    bleed: document.querySelectorAll('.bleed-guide').length,
    viewport: {
      width: document.querySelector('.canvas-viewport').clientWidth,
      height: document.querySelector('.canvas-viewport').clientHeight
    },
    bodyText: document.body.innerText
  }))()`);

  assert(initial.title.includes("Livro Studio"), "Window title is incorrect.");
  assert(initial.pages >= 1, "At least one composed page should be visible.");
  assert(initial.margins === initial.pages, "Every page should show its margin guide.");
  assert(initial.bleed === initial.pages, "Every page should show its bleed guide.");
  assert(initial.bodyText.includes("Configura"), "Properties panel is missing.");

  await fs.mkdir(outputDirectory, { recursive: true });
  const screenshot = await window.webContents.capturePage();
  await fs.writeFile(screenshotPath, screenshot.toPNG());

  const interactions = await window.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

    const editor = document.querySelector('.story-editor');
    const firstText = document.querySelector('[data-story-from]');
    const textNode = firstText.firstChild;
    const selection = window.getSelection();
    selection.setBaseAndExtent(textNode, textNode.textContent.length, textNode, textNode.textContent.length);
    editor.focus();
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { getData: () => ' ' + 'texto para paginação '.repeat(1200) }
    });
    editor.dispatchEvent(pasteEvent);
    await wait(700);
    const pagesAfterPaste = document.querySelectorAll('.trim-page').length;

    const marginToggle = document.querySelectorAll('.check-row input')[0];
    marginToggle.click();
    await wait(50);
    const hiddenMargins = document.querySelectorAll('.margin-guide').length;
    marginToggle.click();

    const select = document.querySelector('select[aria-label^="Predefini"]');
    select.value = 'A4';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(80);
    const page = document.querySelector('.trim-page').getBoundingClientRect();

    const zoom = document.querySelector('input[aria-label="Zoom"]');
    setter.call(zoom, '150');
    zoom.dispatchEvent(new Event('change', { bubbles: true }));
    zoom.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(80);

    const physicalStart = document.querySelector('input[aria-label*="física inicial"]');
    setter.call(physicalStart, '1');
    physicalStart.dispatchEvent(new Event('input', { bubbles: true }));
    physicalStart.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(80);

    const viewport = document.querySelector('.canvas-viewport');

    return {
      hiddenMargins,
      restoredMargins: document.querySelectorAll('.margin-guide').length,
      currentPages: document.querySelectorAll('.trim-page').length,
      a4Ratio: page.height / page.width,
      zoomLabel: document.querySelector('.zoom-control output').textContent,
      dirty: document.querySelector('.saved-indicator.dirty') !== null,
      pagesAfterPaste,
      storyCharacters: [...document.querySelectorAll('[data-story-from]')]
        .reduce((total, node) => total + node.textContent.replace(/\u200b/g, '').length, 0),
      folios: [...document.querySelectorAll('.editorial-folio')].map((node) => node.textContent),
      canScrollHorizontally: viewport.scrollWidth > viewport.clientWidth,
      canScrollVertically: viewport.scrollHeight > viewport.clientHeight
    };
  })()`);

  assert(interactions.hiddenMargins === 0, "Could not hide margins.");
  assert(interactions.pagesAfterPaste > 2, "Large text did not create additional pages.");
  assert(interactions.storyCharacters > 20000, "Inserted manuscript text was lost.");
  assert(interactions.restoredMargins === interactions.currentPages, "Could not restore margins.");
  assert(Math.abs(interactions.a4Ratio - 297 / 210) < 0.02, "A4 preset lost its proportion.");
  assert(interactions.zoomLabel === "150%", "Zoom did not respond to the control.");
  assert(interactions.dirty, "Dirty state indicator did not appear.");
  assert(interactions.folios.includes("3"), "Editorial numbering did not follow dynamic pages.");
  assert(interactions.canScrollHorizontally, "Canvas should allow horizontal scroll at high zoom.");
  assert(interactions.canScrollVertically, "Canvas should allow vertical scroll at high zoom.");

  console.log(JSON.stringify({ screenshotPath, initial, interactions }, null, 2));
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
