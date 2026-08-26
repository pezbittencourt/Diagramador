/// <reference types="vite/client" />

interface Window {
  livroStudio?: {
    platform: string;
    version: string;
    openDocument: () => Promise<
      | { canceled: true }
      | {
          canceled: false;
          filePath: string;
          content: string;
          format: "livro" | "legacy-json";
          warnings: string[];
        }
    >;
    openExternalDocument: (filePath: string) => Promise<{
      canceled: false;
      filePath: string;
      content: string;
      format: "livro" | "legacy-json";
      warnings: string[];
    }>;
    importManuscript: () => Promise<
      | { canceled: true }
      | {
          canceled: false;
          manuscript: {
            filePath: string;
            fileName: string;
            format: "txt" | "docx";
            text: string;
            html?: string;
            warnings: string[];
          };
        }
    >;
    pickImage: () => Promise<
      | { canceled: true }
      | {
          canceled: false;
          image: {
            fileName: string;
            mimeType: "image/png" | "image/jpeg" | "image/webp";
            data: string;
          };
        }
    >;
    confirmReplaceManuscript: () => Promise<boolean>;
    beginNewDocument: () => void;
    saveDocument: (request: {
      content: string;
      filePath?: string;
      suggestedName: string;
    }) => Promise<
      | { canceled: true }
      | { canceled: false; filePath: string; savedAt: string; warnings?: string[] }
    >;
    autosaveDocument: (request: {
      content: string;
      filePath?: string;
      normalSavedAt?: string;
    }) => Promise<{ skipped: boolean; savedAt?: string }>;
    listRecoveries: () => Promise<Array<{
      documentId: string;
      title: string;
      savedAt: string;
      sourcePath?: string;
    }>>;
    loadRecovery: (documentId: string) => Promise<{
      content: string;
      format: "livro";
      warnings: string[];
    }>;
    discardRecovery: (documentId: string) => Promise<void>;
    recoverBackup: (documentId: string) => Promise<
      | { canceled: true; unavailable?: boolean }
      | {
          canceled: false;
          content: string;
          format: "livro";
          warnings: string[];
          backupSavedAt: string;
        }
    >;
    reportError: (payload: { category: string; message: string; stack?: string }) => void;
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
    }) => Promise<
      | { canceled: true }
      | {
          canceled: false;
          filePath: string;
          byteLength: number;
          pageCount: number;
          durationMs: number;
        }
    >;
    confirmUnsavedChanges: (
      action: string,
    ) => Promise<"save" | "discard" | "cancel">;
    setDirty: (dirty: boolean) => void;
    setOperationBusy: (busy: boolean) => void;
    onSaveBeforeClose: (callback: () => void) => () => void;
    onOpenExternalDocument: (callback: (filePath: string) => void) => () => void;
    finishClose: (saved: boolean) => void;
  };
}
