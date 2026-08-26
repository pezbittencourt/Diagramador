import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import path from "node:path";
import os from "node:os";
import { importManuscriptFile } from "./manuscriptFiles.js";
import { importImageFile } from "./imageFiles.js";
import { configureLogging, logError } from "./appLog.js";
import {
  createBackup,
  discardRecovery,
  listBackups,
  listRecoveries,
  openProjectFile,
  writeLivroFile,
  writeRecovery,
} from "./projectFiles.js";
import {
  renderPdfChunksAndWriteFile,
  validatePdfExportRequest,
  type PdfExportRequest,
} from "./pdfExport.js";
import { APP_NAME, APP_USER_MODEL_ID, APP_VERSION } from "./appMetadata.js";
import { runPackagedSmoke } from "./packagedSmoke.js";
import {
  findPackagedSmokeRoot,
  findProjectPathInArguments,
  isOpenableProjectPath,
  resolveRuntimeResourcePaths,
} from "./windowsIntegration.js";

app.setName(APP_NAME);
const isDev = !app.isPackaged && Boolean(process.env.VITE_DEV_SERVER_URL);
const packagedSmokeRoot = app.isPackaged ? findPackagedSmokeRoot(process.argv, os.tmpdir()) : undefined;
if (packagedSmokeRoot) app.setPath("userData", path.join(packagedSmokeRoot, "user-data"));
const dirtyWindows = new WeakMap<BrowserWindow, boolean>();
const closeAllowed = new WeakSet<BrowserWindow>();
const closePromptOpen = new WeakSet<BrowserWindow>();
const pdfExportInProgress = new WeakSet<BrowserWindow>();
const fileWriteInProgress = new WeakSet<BrowserWindow>();
const rendererOperationInProgress = new WeakSet<BrowserWindow>();
const currentProjectPaths = new WeakMap<BrowserWindow, string>();
const rendererReady = new WeakSet<BrowserWindow>();
const pendingExternalProjectPaths = new WeakMap<BrowserWindow, Set<string>>();
const externalOpenQueues = new WeakMap<BrowserWindow, string[]>();
let mainWindow: BrowserWindow | undefined;

interface SaveDocumentRequest {
  content: string;
  filePath?: string;
  suggestedName: string;
}

interface SaveDocumentResult {
  canceled: boolean;
  filePath?: string;
  savedAt?: string;
  warnings?: string[];
}

ipcMain.on("app:get-version", (event) => {
  event.returnValue = app.getVersion();
});

function dataDirectories() {
  const root = app.getPath("userData");
  return {
    recovery: path.join(root, "recovery"),
    backups: path.join(root, "backups"),
  };
}

function samePath(left: string, right: string): boolean {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function friendlyFileError(error: unknown, fallback: string): Error {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as NodeJS.ErrnoException).code)
    : "";
  if (code === "ENOENT") return new Error("O arquivo não foi encontrado. Ele pode ter sido movido ou removido.");
  if (code === "EACCES" || code === "EPERM") return new Error("O sistema não permitiu acessar esse arquivo. Verifique as permissões e tente novamente.");
  if (code === "ENOSPC") return new Error("Não há espaço livre suficiente para concluir a gravação.");
  if (error instanceof Error && !/^(TypeError|ReferenceError|ENOENT|EACCES|EPERM)\b/u.test(error.message)) return error;
  return new Error(fallback);
}

async function withLoggedError<T>(category: string, fallback: string, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    await logError(category, error);
    throw friendlyFileError(error, fallback);
  }
}

function windowFromSender(sender: Electron.WebContents): BrowserWindow {
  const window = BrowserWindow.fromWebContents(sender);
  if (!window) throw new Error("Janela do documento não encontrada.");
  return window;
}

async function openProjectForWindow(window: BrowserWindow, filePath: string) {
  const opened = await openProjectFile(filePath);
  if (opened.warnings.length) void logError("asset-invalid", new Error(opened.warnings.join(" ")), {
    fileName: path.basename(filePath),
    warningCount: opened.warnings.length,
  });
  currentProjectPaths.set(window, path.resolve(filePath));
  return { canceled: false as const, filePath, ...opened };
}

function flushExternalOpenQueue(window: BrowserWindow): void {
  if (!rendererReady.has(window) || window.isDestroyed()) return;
  const queue = externalOpenQueues.get(window) ?? [];
  externalOpenQueues.set(window, []);
  for (const filePath of queue) {
    window.webContents.send("document:open-external-request", filePath);
  }
}

function queueExternalProject(window: BrowserWindow, filePath: string): void {
  const resolved = path.resolve(filePath);
  if (!isOpenableProjectPath(resolved)) return;
  const authorized = pendingExternalProjectPaths.get(window) ?? new Set<string>();
  authorized.add(resolved);
  pendingExternalProjectPaths.set(window, authorized);
  const queue = externalOpenQueues.get(window) ?? [];
  if (!queue.some((candidate) => samePath(candidate, resolved))) queue.push(resolved);
  externalOpenQueues.set(window, queue);
  flushExternalOpenQueue(window);
}

function showAboutDialog(): void {
  const options = {
    type: "info" as const,
    title: `Sobre o ${APP_NAME}`,
    message: `${APP_NAME} ${APP_VERSION}`,
    detail: "Editor desktop pessoal para escrita e diagramação de livros.",
    buttons: ["Fechar"],
  };
  const focused = BrowserWindow.getFocusedWindow();
  if (focused) void dialog.showMessageBox(focused, options);
  else void dialog.showMessageBox(options);
}

function configureApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "Arquivo",
      submenu: [{ label: "Fechar", role: "close" }],
    },
    {
      label: "Editar",
      submenu: [
        { label: "Desfazer", role: "undo" },
        { label: "Refazer", role: "redo" },
        { type: "separator" },
        { label: "Recortar", role: "cut" },
        { label: "Copiar", role: "copy" },
        { label: "Colar", role: "paste" },
        { label: "Selecionar tudo", role: "selectAll" },
      ],
    },
    ...(isDev ? [{
      label: "Desenvolvimento",
      submenu: [{ label: "Alternar DevTools", role: "toggleDevTools" as const }],
    }] : []),
    {
      label: "Ajuda",
      submenu: [{ label: `Sobre o ${APP_NAME}`, click: showAboutDialog }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
  return withLoggedError("project-open", "Não foi possível abrir o projeto.", async () => {
    const window = windowFromSender(event.sender);
    const result = await dialog.showOpenDialog(window, {
      title: "Abrir projeto do Livro Studio",
      properties: ["openFile"],
      filters: [
        { name: "Projeto Livro Studio", extensions: ["livro"] },
        { name: "Projetos legados (JSON)", extensions: ["json"] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return openProjectForWindow(window, result.filePaths[0]);
  });
});

ipcMain.handle("document:open-external", async (event, requestedPath: unknown) => {
  return withLoggedError("project-open-associated", "Não foi possível abrir o projeto solicitado pelo Windows.", async () => {
    const window = windowFromSender(event.sender);
    if (typeof requestedPath !== "string" || !isOpenableProjectPath(requestedPath)) {
      throw new Error("O Windows forneceu um caminho de projeto inválido.");
    }
    const resolved = path.resolve(requestedPath);
    const authorized = pendingExternalProjectPaths.get(window);
    const match = [...(authorized ?? [])].find((candidate) => samePath(candidate, resolved));
    if (!match) throw new Error("O caminho solicitado não foi autorizado pelo sistema operacional.");
    authorized?.delete(match);
    return openProjectForWindow(window, resolved);
  });
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
    if (fileWriteInProgress.has(window)) throw new Error("Já existe um salvamento em andamento.");
    fileWriteInProgress.add(window);
    try {
      return await withLoggedError("project-save", "Não foi possível salvar o projeto.", async () => {
        const authorizedPath = currentProjectPaths.get(window);
        let filePath = request.filePath && authorizedPath && samePath(request.filePath, authorizedPath)
          ? authorizedPath
          : undefined;
        if (filePath?.toLowerCase().endsWith(".json")) filePath = undefined;
        if (!filePath) {
          const safeSuggestion = path.basename(
            typeof request.suggestedName === "string" ? request.suggestedName : "livro-sem-titulo.livro",
          ).replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-");
          const result = await dialog.showSaveDialog(window, {
            title: "Salvar projeto do Livro Studio",
            defaultPath: safeSuggestion || "livro-sem-titulo.livro",
            filters: [
              { name: "Projeto Livro Studio", extensions: ["livro"] },
            ],
          });
          if (result.canceled || !result.filePath) return { canceled: true };
          filePath = result.filePath.toLowerCase().endsWith(".livro")
            ? result.filePath
            : `${result.filePath}.livro`;
        }
        const parsed = JSON.parse(request.content) as { id?: unknown };
        const documentId = typeof parsed.id === "string" ? parsed.id : "unknown";
        const warnings: string[] = [];
        try { await createBackup(dataDirectories().backups, documentId, filePath); }
        catch (error) {
          warnings.push("O projeto foi salvo, mas o backup anterior não pôde ser atualizado.");
          void logError("backup-create", error);
        }
        const metadata = await writeLivroFile(filePath, request.content, { kind: "project" });
        currentProjectPaths.set(window, path.resolve(filePath));
        try { await discardRecovery(dataDirectories().recovery, metadata.documentId); }
        catch (error) { void logError("recovery-cleanup", error); }
        return { canceled: false, filePath, savedAt: metadata.savedAt, warnings };
      });
    } finally {
      fileWriteInProgress.delete(window);
    }
  },
);

ipcMain.handle("document:autosave", async (event, request: { content: string; normalSavedAt?: string }) => {
  const window = windowFromSender(event.sender);
  if (fileWriteInProgress.has(window)) return { skipped: true };
  fileWriteInProgress.add(window);
  try {
    const metadata = await withLoggedError("autosave", "Não foi possível atualizar a recuperação automática.", () =>
      writeRecovery(dataDirectories().recovery, request.content, currentProjectPaths.get(window), request.normalSavedAt));
    return { skipped: false, savedAt: metadata.savedAt };
  } finally {
    fileWriteInProgress.delete(window);
  }
});

ipcMain.handle("recovery:list", async () => listRecoveries(dataDirectories().recovery));

ipcMain.handle("recovery:load", async (event, documentId: string) => {
  if (typeof documentId !== "string" || documentId.length > 256) throw new Error("Identificador de recovery inválido.");
  const candidate = (await listRecoveries(dataDirectories().recovery))
    .find((item) => item.documentId === documentId);
  if (!candidate) throw new Error("A versão de recuperação não está mais disponível.");
  const opened = await openProjectFile(candidate.filePath);
  const window = windowFromSender(event.sender);
  if (candidate.sourcePath?.toLowerCase().endsWith(".livro")) {
    try {
      const source = await openProjectFile(candidate.sourcePath);
      if (source.metadata?.documentId === documentId) currentProjectPaths.set(window, path.resolve(candidate.sourcePath));
      else currentProjectPaths.delete(window);
    } catch { currentProjectPaths.delete(window); }
  } else currentProjectPaths.delete(window);
  return opened;
});

ipcMain.handle("recovery:discard", async (_event, documentId: string) => {
  if (typeof documentId !== "string" || documentId.length > 256) throw new Error("Identificador de recovery inválido.");
  await discardRecovery(dataDirectories().recovery, documentId);
});

ipcMain.handle("backup:recover", async (event, documentId: string) => {
  if (typeof documentId !== "string" || documentId.length > 256) throw new Error("Identificador de backup inválido.");
  const window = windowFromSender(event.sender);
  const backups = await listBackups(dataDirectories().backups, documentId);
  if (!backups.length) return { canceled: true, unavailable: true };
  const labels = backups.map((backup) => `Backup · ${new Date(backup.savedAt).toLocaleString("pt-BR")}`);
  const result = await dialog.showMessageBox(window, {
    type: "question",
    title: "Recuperar versão anterior",
    message: "Escolha uma versão de backup para abrir.",
    detail: "A versão será carregada como alterações não salvas e não substituirá o arquivo atual.",
    buttons: [...labels, "Cancelar"],
    defaultId: 0,
    cancelId: labels.length,
    noLink: true,
  });
  if (result.response >= backups.length) return { canceled: true };
  const opened = await openProjectFile(backups[result.response].filePath);
  currentProjectPaths.delete(window);
  return { canceled: false, ...opened, backupSavedAt: backups[result.response].savedAt };
});

ipcMain.on("document:new-session", (event) => {
  currentProjectPaths.delete(windowFromSender(event.sender));
});

ipcMain.on("app:renderer-error", (_event, payload: { category?: unknown; message?: unknown; stack?: unknown }) => {
  const message = typeof payload?.message === "string" ? payload.message.slice(0, 2000) : "Erro inesperado no renderer";
  const error = new Error(message);
  if (typeof payload?.stack === "string") error.stack = payload.stack.slice(0, 8000);
  void logError(typeof payload?.category === "string" ? payload.category : "renderer", error);
});

ipcMain.handle("pdf:export", async (event, rawRequest: PdfExportRequest) => {
  const window = windowFromSender(event.sender);
  if (pdfExportInProgress.has(window)) {
    throw new Error("Já existe uma exportação PDF em andamento nesta janela.");
  }
  pdfExportInProgress.add(window);
  try {
    const request = validatePdfExportRequest(rawRequest);
    const destination = await dialog.showSaveDialog(window, {
      title: "Exportar PDF do Livro Studio",
      defaultPath: request.suggestedName,
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (destination.canceled || !destination.filePath) return { canceled: true };
    const filePath = destination.filePath.toLowerCase().endsWith(".pdf")
      ? destination.filePath
      : `${destination.filePath}.pdf`;
    const result = await renderPdfChunksAndWriteFile(
      () => new BrowserWindow({
        width: 1024,
        height: 768,
        show: false,
        backgroundColor: "#ffffff",
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false,
        },
      }),
      filePath,
      request,
    );
    return {
      canceled: false,
      filePath,
      ...result,
    };
  } catch (error) {
    await logError("pdf-export", error);
    throw friendlyFileError(error, "Não foi possível exportar o PDF.");
  } finally {
    pdfExportInProgress.delete(window);
  }
});

ipcMain.handle("document:confirm-unsaved", async (event, action: string) =>
  confirmUnsavedChanges(windowFromSender(event.sender), action),
);

ipcMain.on("document:set-dirty", (event, dirty: boolean) => {
  const window = windowFromSender(event.sender);
  dirtyWindows.set(window, dirty);
  window.setDocumentEdited(dirty);
});

ipcMain.on("document:set-operation-busy", (event, busy: boolean) => {
  const window = windowFromSender(event.sender);
  if (busy) rendererOperationInProgress.add(window);
  else rendererOperationInProgress.delete(window);
});

ipcMain.on("document:finish-close", (event, saved: boolean) => {
  const window = windowFromSender(event.sender);
  closePromptOpen.delete(window);
  if (!saved) return;
  closeAllowed.add(window);
  window.close();
});

function createWindow(initialProjectPath?: string): BrowserWindow {
  const resources = resolveRuntimeResourcePaths(__dirname, process.resourcesPath, app.isPackaged);
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#17201d",
    title: APP_NAME,
    icon: resources.windowIcon,
    show: false,
    webPreferences: {
      preload: resources.preload,
      contextIsolation: true,
      devTools: isDev,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.once("did-finish-load", () => {
    rendererReady.add(window);
    flushExternalOpenQueue(window);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    void logError("renderer-process-gone", new Error(`Renderer encerrado: ${details.reason}`), {
      exitCode: details.exitCode,
    });
  });

  window.on("close", (event) => {
    if (pdfExportInProgress.has(window) || fileWriteInProgress.has(window) || rendererOperationInProgress.has(window)) {
      event.preventDefault();
      void dialog.showMessageBox(window, {
        type: "info",
        title: "Operação em andamento",
        message: pdfExportInProgress.has(window) || rendererOperationInProgress.has(window)
          ? "A exportação PDF ainda está em andamento."
          : "O salvamento ainda está em andamento.",
        detail: "Aguarde a conclusão antes de fechar o Livro Studio.",
        buttons: ["Entendi"],
      });
      return;
    }
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

  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });

  if (initialProjectPath) queueExternalProject(window, initialProjectPath);

  const loading = isDev
    ? window.loadURL(process.env.VITE_DEV_SERVER_URL!)
    : window.loadFile(resources.renderer);
  void loading.catch(async (error) => {
    await logError("startup-renderer-load", error, { packaged: app.isPackaged });
    if (!window.isDestroyed()) {
      await dialog.showMessageBox(window, {
        type: "error",
        title: `${APP_NAME} não pôde iniciar`,
        message: "A interface do Livro Studio não pôde ser carregada.",
        detail: "Reinstale o aplicativo. Se o problema continuar, consulte os logs locais.",
        buttons: ["Fechar"],
      });
      window.destroy();
    }
  });
  return window;
}

let startupProjectPath = findProjectPathInArguments(process.argv, process.cwd());
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv, workingDirectory) => {
    const requestedProject = findProjectPathInArguments(argv, workingDirectory);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      if (requestedProject) queueExternalProject(mainWindow, requestedProject);
    } else if (requestedProject) {
      startupProjectPath = requestedProject;
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId(APP_USER_MODEL_ID);
    configureLogging(app.getPath("userData"));
    process.on("uncaughtException", (error) => { void logError("main-uncaught", error); });
    process.on("unhandledRejection", (error) => { void logError("main-unhandled-rejection", error); });
    if (packagedSmokeRoot) {
      const resources = resolveRuntimeResourcePaths(__dirname, process.resourcesPath, app.isPackaged);
      try {
        await runPackagedSmoke({
          root: packagedSmokeRoot,
          userData: app.getPath("userData"),
          renderer: resources.renderer,
          preload: resources.preload,
        });
        app.exit(0);
      } catch (error) {
        await logError("packaged-smoke", error);
        app.exit(1);
      }
      return;
    }
    configureApplicationMenu();
    mainWindow = createWindow(startupProjectPath);
    startupProjectPath = undefined;
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (!packagedSmokeRoot && process.platform !== "darwin") app.quit();
});
