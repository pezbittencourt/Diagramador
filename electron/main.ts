import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import { readDocumentFile, writeDocumentFile } from "./documentFiles.js";
import { importManuscriptFile } from "./manuscriptFiles.js";
import { importImageFile } from "./imageFiles.js";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const dirtyWindows = new WeakMap<BrowserWindow, boolean>();
const closeAllowed = new WeakSet<BrowserWindow>();
const closePromptOpen = new WeakSet<BrowserWindow>();

interface SaveDocumentRequest {
  content: string;
  filePath?: string;
  suggestedName: string;
}

interface SaveDocumentResult {
  canceled: boolean;
  filePath?: string;
}

function windowFromSender(sender: Electron.WebContents): BrowserWindow {
  const window = BrowserWindow.fromWebContents(sender);
  if (!window) throw new Error("Janela do documento não encontrada.");
  return window;
}

async function confirmUnsavedChanges(window: BrowserWindow, action: string) {
  const result = await dialog.showMessageBox(window, {
    type: "warning",
    title: "Alterações não salvas",
    message: "Este documento possui alterações não salvas.",
    detail: `Deseja salvar antes de ${action}?`,
    buttons: ["Salvar", "Não salvar", "Cancelar"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });

  return (["save", "discard", "cancel"] as const)[result.response] ?? "cancel";
}

ipcMain.handle("document:open", async (event) => {
  const window = windowFromSender(event.sender);
  const result = await dialog.showOpenDialog(window, {
    title: "Abrir projeto do Livro Studio",
    properties: ["openFile"],
    filters: [
      { name: "Projeto do Livro Studio", extensions: ["json"] },
    ],
  });

  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const filePath = result.filePaths[0];
  return { canceled: false, filePath, content: await readDocumentFile(filePath) };
});

ipcMain.handle("manuscript:import", async (event) => {
  const window = windowFromSender(event.sender);
  const result = await dialog.showOpenDialog(window, {
    title: "Importar manuscrito",
    properties: ["openFile"],
    filters: [
      { name: "Manuscritos", extensions: ["txt", "docx"] },
      { name: "Texto simples", extensions: ["txt"] },
      { name: "Documento do Word", extensions: ["docx"] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  return { canceled: false, manuscript: await importManuscriptFile(result.filePaths[0]) };
});

ipcMain.handle("asset:pick-image", async (event) => {
  const window = windowFromSender(event.sender);
  const result = await dialog.showOpenDialog(window, {
    title: "Inserir imagem",
    properties: ["openFile"],
    filters: [
      { name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp"] },
      { name: "PNG", extensions: ["png"] },
      { name: "JPEG", extensions: ["jpg", "jpeg"] },
      { name: "WebP", extensions: ["webp"] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  return { canceled: false, image: await importImageFile(result.filePaths[0]) };
});

ipcMain.handle("manuscript:confirm-replace", async (event) => {
  const window = windowFromSender(event.sender);
  const result = await dialog.showMessageBox(window, {
    type: "warning",
    title: "Substituir manuscrito",
    message: "O texto atual será substituído pelo manuscrito importado.",
    detail: "As configurações de página e numeração serão preservadas.",
    buttons: ["Substituir", "Cancelar"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  return result.response === 0;
});

ipcMain.handle(
  "document:save",
  async (event, request: SaveDocumentRequest): Promise<SaveDocumentResult> => {
    const window = windowFromSender(event.sender);
    let filePath = request.filePath;

    if (!filePath) {
      const result = await dialog.showSaveDialog(window, {
        title: "Salvar projeto do Livro Studio",
        defaultPath: request.suggestedName,
        filters: [
          { name: "Projeto do Livro Studio", extensions: ["json"] },
        ],
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      filePath = result.filePath;
    }

    await writeDocumentFile(filePath, request.content);
    return { canceled: false, filePath };
  },
);

ipcMain.handle("document:confirm-unsaved", async (event, action: string) =>
  confirmUnsavedChanges(windowFromSender(event.sender), action),
);

ipcMain.on("document:set-dirty", (event, dirty: boolean) => {
  const window = windowFromSender(event.sender);
  dirtyWindows.set(window, dirty);
  window.setDocumentEdited(dirty);
});

ipcMain.on("document:finish-close", (event, saved: boolean) => {
  const window = windowFromSender(event.sender);
  closePromptOpen.delete(window);
  if (!saved) return;
  closeAllowed.add(window);
  window.close();
});

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#17201d",
    title: "Livro Studio",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  window.on("close", (event) => {
    if (!dirtyWindows.get(window) || closeAllowed.has(window)) return;
    event.preventDefault();
    if (closePromptOpen.has(window)) return;
    closePromptOpen.add(window);

    void confirmUnsavedChanges(window, "fechar o programa").then((decision) => {
      if (decision === "discard") {
        closeAllowed.add(window);
        window.close();
      } else if (decision === "save") {
        window.webContents.send("document:save-before-close");
      } else {
        closePromptOpen.delete(window);
      }
    });
  });

  if (isDev) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    void window.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
