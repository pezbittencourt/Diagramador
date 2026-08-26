import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("livroStudio", {
  platform: process.platform,
  version: ipcRenderer.sendSync("app:get-version") as string,
  openDocument: () => ipcRenderer.invoke("document:open"),
  openExternalDocument: (filePath: string) => ipcRenderer.invoke("document:open-external", filePath),
  importManuscript: () => ipcRenderer.invoke("manuscript:import"),
  pickImage: () => ipcRenderer.invoke("asset:pick-image"),
  confirmReplaceManuscript: () => ipcRenderer.invoke("manuscript:confirm-replace"),
  beginNewDocument: () => ipcRenderer.send("document:new-session"),
  saveDocument: (request: {
    content: string;
    filePath?: string;
    suggestedName: string;
  }) => ipcRenderer.invoke("document:save", request),
  autosaveDocument: (request: {
    content: string;
    filePath?: string;
    normalSavedAt?: string;
  }) => ipcRenderer.invoke("document:autosave", request),
  listRecoveries: () => ipcRenderer.invoke("recovery:list"),
  loadRecovery: (documentId: string) => ipcRenderer.invoke("recovery:load", documentId),
  discardRecovery: (documentId: string) => ipcRenderer.invoke("recovery:discard", documentId),
  recoverBackup: (documentId: string) => ipcRenderer.invoke("backup:recover", documentId),
  reportError: (payload: { category: string; message: string; stack?: string }) =>
    ipcRenderer.send("app:renderer-error", payload),
  exportPdf: (request: {
    suggestedName: string;
    title: string;
    widthMm: number;
    heightMm: number;
    expectedPageCount: number;
    cssText: string;
    htmlChunks: string[];
    assets: Array<{
      fileName: string;
      mimeType: "image/png" | "image/jpeg" | "image/webp";
      data: string;
    }>;
  }) => ipcRenderer.invoke("pdf:export", request),
  confirmUnsavedChanges: (action: string) =>
    ipcRenderer.invoke("document:confirm-unsaved", action),
  setDirty: (dirty: boolean) => ipcRenderer.send("document:set-dirty", dirty),
  setOperationBusy: (busy: boolean) => ipcRenderer.send("document:set-operation-busy", busy),
  onSaveBeforeClose: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("document:save-before-close", listener);
    return () => ipcRenderer.removeListener("document:save-before-close", listener);
  },
  onOpenExternalDocument: (callback: (filePath: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, filePath: string) => callback(filePath);
    ipcRenderer.on("document:open-external-request", listener);
    return () => ipcRenderer.removeListener("document:open-external-request", listener);
  },
  finishClose: (saved: boolean) =>
    ipcRenderer.send("document:finish-close", saved),
});
