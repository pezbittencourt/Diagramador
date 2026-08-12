const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outputDirectory = path.join(root, ".tmp");
const screenshotPath = path.join(outputDirectory, "livro-studio-smoke.png");

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
      sandbox: true,
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

  assert(initial.title === "Livro Studio", "Título da janela incorreto.");
  assert(initial.pages === 2, "O spread não contém duas páginas.");
  assert(initial.margins === 2, "As duas guias de margem deveriam estar visíveis.");
  assert(initial.bleed === 2, "As duas guias de sangria deveriam estar visíveis.");
  assert(initial.bodyText.includes("Configuração da página"), "Painel de propriedades ausente.");

  await fs.mkdir(outputDirectory, { recursive: true });
  const screenshot = await window.webContents.capturePage();
  await fs.writeFile(screenshotPath, screenshot.toPNG());

  const interactions = await window.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const marginToggle = document.querySelectorAll('.check-row input')[0];
    marginToggle.click();
    await wait(50);
    const hiddenMargins = document.querySelectorAll('.margin-guide').length;
    marginToggle.click();

    const select = document.querySelector('select[aria-label="Predefinição de página"]');
    select.value = 'A4';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(80);
    const page = document.querySelector('.trim-page').getBoundingClientRect();

    const zoom = document.querySelector('input[aria-label="Zoom"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(zoom, '150');
    zoom.dispatchEvent(new Event('change', { bubbles: true }));
    zoom.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(80);
    const viewport = document.querySelector('.canvas-viewport');

    return {
      hiddenMargins,
      restoredMargins: document.querySelectorAll('.margin-guide').length,
      a4Ratio: page.height / page.width,
      zoomLabel: document.querySelector('.zoom-control output').textContent,
      canScrollHorizontally: viewport.scrollWidth > viewport.clientWidth,
      canScrollVertically: viewport.scrollHeight > viewport.clientHeight
    };
  })()`);

  assert(interactions.hiddenMargins === 0, "Não foi possível ocultar as margens.");
  assert(interactions.restoredMargins === 2, "Não foi possível restaurar as margens.");
  assert(Math.abs(interactions.a4Ratio - 297 / 210) < 0.02, "O preset A4 perdeu sua proporção.");
  assert(interactions.zoomLabel === "150%", "O zoom não respondeu ao controle.");
  assert(interactions.canScrollHorizontally, "O canvas não permite scroll horizontal com zoom alto.");
  assert(interactions.canScrollVertically, "O canvas não permite scroll vertical com zoom alto.");

  console.log(JSON.stringify({ screenshotPath, initial, interactions }, null, 2));
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});

