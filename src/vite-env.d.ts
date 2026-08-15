/// <reference types="vite/client" />

interface Window {
  livroStudio?: {
    platform: string;
    version: string;
    openDocument: () => Promise<
      | { canceled: true }
      | { canceled: false; filePath: string; content: string }
    >;
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
    saveDocument: (request: {
      content: string;
      filePath?: string;
      suggestedName: string;
    }) => Promise<
      | { canceled: true }
      | { canceled: false; filePath: string }
    >;
    confirmUnsavedChanges: (
      action: string,
    ) => Promise<"save" | "discard" | "cancel">;
    setDirty: (dirty: boolean) => void;
    onSaveBeforeClose: (callback: () => void) => () => void;
    finishClose: (saved: boolean) => void;
  };
}
