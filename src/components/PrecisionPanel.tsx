import type { DocumentGuide } from "../domain/document";

interface PrecisionPanelProps {
  showRulers: boolean;
  showCustomGuides: boolean;
  snapEnabled: boolean;
  guides: DocumentGuide[];
  onShowRulersChange: (show: boolean) => void;
  onShowCustomGuidesChange: (show: boolean) => void;
  onSnapEnabledChange: (enabled: boolean) => void;
  onAddGuide: (orientation: DocumentGuide["orientation"]) => void;
  onGuideChange: (guide: DocumentGuide) => void;
  onDeleteGuide: (guideId: string) => void;
}

export function PrecisionPanel({
  showRulers,
  showCustomGuides,
  snapEnabled,
  guides,
  onShowRulersChange,
  onShowCustomGuidesChange,
  onSnapEnabledChange,
  onAddGuide,
  onGuideChange,
  onDeleteGuide,
}: PrecisionPanelProps) {
  return (
    <section className="panel-section precision-panel">
      <h2>Precisão</h2>
      <label className="compact-check-row">
        <input type="checkbox" checked={showRulers} onChange={(event) => onShowRulersChange(event.currentTarget.checked)} />
        Mostrar réguas
      </label>
      <label className="compact-check-row">
        <input type="checkbox" checked={showCustomGuides} onChange={(event) => onShowCustomGuidesChange(event.currentTarget.checked)} />
        Mostrar guias personalizadas
      </label>
      <label className="compact-check-row">
        <input type="checkbox" checked={snapEnabled} onChange={(event) => onSnapEnabledChange(event.currentTarget.checked)} />
        Ajustar às guias / Snap
      </label>
      <div className="guide-actions">
        <button type="button" onClick={() => onAddGuide("vertical")}>+ Vertical</button>
        <button type="button" onClick={() => onAddGuide("horizontal")}>+ Horizontal</button>
      </div>
      {guides.length > 0 && (
        <div className="guide-list">
          {guides.map((guide) => (
            <div key={guide.id} className="guide-list-row">
              <span title={guide.orientation}>{guide.orientation === "vertical" ? "V" : "H"}</span>
              <input
                aria-label={`Posição da guia ${guide.orientation} em milímetros`}
                type="number"
                step="0.5"
                value={Number(guide.positionMm.toFixed(3))}
                onChange={(event) => {
                  const positionMm = event.currentTarget.valueAsNumber;
                  if (Number.isFinite(positionMm)) onGuideChange({ ...guide, positionMm });
                }}
              />
              <small>mm</small>
              <button type="button" aria-label="Excluir guia" onClick={() => onDeleteGuide(guide.id)}>×</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
