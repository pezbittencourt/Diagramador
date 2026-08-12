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
            warnings: string[];
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
