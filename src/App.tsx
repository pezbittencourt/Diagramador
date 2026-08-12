import { useState } from "react";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { Workspace } from "./components/Workspace";
import { createDefaultDocument, PAGE_PRESETS } from "./domain/defaultDocument";
import { isValidPageSetup } from "./domain/pageGeometry";
import type { PageSetup } from "./domain/document";

export default function App() {
  const [document, setDocument] = useState(createDefaultDocument);
  const [zoom, setZoom] = useState(72);
  const [showMargins, setShowMargins] = useState(true);
  const [showBleed, setShowBleed] = useState(true);

  const updatePageSetup = (pageSetup: PageSetup) => {
    setDocument((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      pageSetup,
    }));
  };

  const valid = isValidPageSetup(document.pageSetup);
  const presetName = Object.entries(PAGE_PRESETS).find(
    ([, size]) =>
      size.width === document.pageSetup.width &&
      size.height === document.pageSetup.height,
  )?.[0];

  return (
    <div className="app-shell">
      <header className="app-bar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>
            <strong>Livro Studio</strong>
            <small>protótipo 0.1</small>
          </span>
        </div>
        <div className="document-name">
          <span className="saved-indicator" />
          {document.title}
        </div>
        <div className="app-actions">
          <button type="button" disabled title="Persistência será ligada na próxima etapa">Abrir</button>
          <button type="button" disabled title="Persistência será ligada na próxima etapa">Salvar</button>
        </div>
      </header>

      <div className="app-content">
        <PropertiesPanel
          setup={document.pageSetup}
          showMargins={showMargins}
          showBleed={showBleed}
          onSetupChange={updatePageSetup}
          onShowMarginsChange={setShowMargins}
          onShowBleedChange={setShowBleed}
        />
        <Workspace
          setup={document.pageSetup}
          zoom={zoom}
          showMargins={showMargins}
          showBleed={showBleed}
          onZoomChange={setZoom}
        />
      </div>
      {!valid && (
        <div className="validation-banner" role="alert">
          As margens precisam caber dentro da página e todos os valores devem ser positivos.
        </div>
      )}
      <footer className="status-bar">
        <span>2 páginas visíveis</span>
        <span>{presetName ?? "Personalizado"} · margens {document.pageSetup.mirroredMargins ? "espelhadas" : "fixas"}</span>
        <span>{window.livroStudio ? `Desktop · v${window.livroStudio.version}` : "Preview web"}</span>
      </footer>
    </div>
  );
}
