import { useRef } from "react";
import type { PageSetup } from "../domain/document";
import { PagePreview } from "./PagePreview";

interface WorkspaceProps {
  setup: PageSetup;
  zoom: number;
  showMargins: boolean;
  showBleed: boolean;
  onZoomChange: (zoom: number) => void;
}

export function Workspace({
  setup,
  zoom,
  showMargins,
  showBleed,
  onZoomChange,
}: WorkspaceProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  const fitSpread = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const availableWidth = viewport.clientWidth - 128;
    const spreadMm = setup.width * 2 + setup.bleed.inner * 2 + setup.bleed.outer * 2 + 12;
    const scaleAt100 = 96 / 25.4;
    onZoomChange(Math.max(25, Math.min(150, (availableWidth / (spreadMm * scaleAt100)) * 100)));
  };

  return (
    <main className="workspace">
      <header className="workspace-toolbar">
        <div className="view-switcher" aria-label="Modo de visualização">
          <button className="view-button active" type="button" aria-pressed="true">Spread</button>
          <button className="view-button" type="button" disabled title="Disponível em uma próxima etapa">Página única</button>
        </div>
        <div className="zoom-control">
          <button type="button" aria-label="Diminuir zoom" onClick={() => onZoomChange(Math.max(25, zoom - 10))}>−</button>
          <input
            aria-label="Zoom"
            type="range"
            min="25"
            max="200"
            step="5"
            value={zoom}
            onChange={(event) => onZoomChange(Number(event.currentTarget.value))}
          />
          <button type="button" aria-label="Aumentar zoom" onClick={() => onZoomChange(Math.min(200, zoom + 10))}>+</button>
          <output>{Math.round(zoom)}%</output>
          <button className="fit-button" type="button" onClick={fitSpread}>Ajustar spread</button>
        </div>
      </header>

      <div className="canvas-viewport" ref={viewportRef}>
        <div className="canvas-stage">
          <div className="spread-label">
            <span>SPREAD 02–03</span>
            <span>{setup.width} × {setup.height} mm</span>
          </div>
          <div className="spread">
            <PagePreview setup={setup} physicalIndex={1} scale={zoom / 100} showMargins={showMargins} showBleed={showBleed} />
            <div className="spine" aria-hidden="true" />
            <PagePreview setup={setup} physicalIndex={2} scale={zoom / 100} showMargins={showMargins} showBleed={showBleed} />
          </div>
          <p className="canvas-note">As medidas são calculadas em milímetros. A aparência física exata depende da calibração do monitor.</p>
        </div>
      </div>
    </main>
  );
}

