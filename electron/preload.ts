import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("livroStudio", {
  platform: process.platform,
  version: "0.5.0",
  openDocument: () => ipcRenderer.invoke("document:open"),
  importManuscript: () => ipcRenderer.invoke("manuscript:import"),
  confirmReplaceManuscript: () => ipcRenderer.invoke("manuscript:confirm-replace"),
  saveDocument: (request: {
    content: string;
    filePath?: string;
    suggestedName: string;
  }) => ipcRenderer.invoke("document:save", request),
  confirmUnsavedChanges: (action: string) =>
    ipcRenderer.invoke("document:confirm-unsaved", action),
  setDirty: (dirty: boolean) => ipcRenderer.send("document:set-dirty", dirty),
  onSaveBeforeClose: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("document:save-before-close", listener);
    return () => ipcRenderer.removeListener("document:save-before-close", listener);
  },
  finishClose: (saved: boolean) =>
    ipcRenderer.send("document:finish-close", saved),
});
