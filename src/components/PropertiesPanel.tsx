import { PAGE_PRESETS } from "../domain/defaultDocument";
import type { DocumentGuide, EdgeValues, PageSetup, PositionedImageObject } from "../domain/document";
import type { PageAlignment, StackAction } from "../domain/objectGeometry";
import { NumberField } from "./NumberField";
import { NumberingPanel } from "./NumberingPanel";
import type { PageNumbering } from "../domain/document";
import { ObjectPropertiesPanel } from "./ObjectPropertiesPanel";
import { PrecisionPanel } from "./PrecisionPanel";

interface PropertiesPanelProps {
  setup: PageSetup;
  showMargins: boolean;
  showBleed: boolean;
  numbering: PageNumbering;
  showRulers: boolean;
  showCustomGuides: boolean;
  snapEnabled: boolean;
  guides: DocumentGuide[];
  selectedObject?: { pageIndex: number; object: PositionedImageObject };
  onSetupChange: (setup: PageSetup) => void;
  onShowMarginsChange: (show: boolean) => void;
  onShowBleedChange: (show: boolean) => void;
  onNumberingChange: (numbering: PageNumbering) => void;
  onShowRulersChange: (show: boolean) => void;
  onShowCustomGuidesChange: (show: boolean) => void;
  onSnapEnabledChange: (enabled: boolean) => void;
  onAddGuide: (orientation: DocumentGuide["orientation"]) => void;
  onGuideChange: (guide: DocumentGuide) => void;
  onDeleteGuide: (guideId: string) => void;
  onObjectMeasureChange: (measure: "x" | "y" | "width" | "height", value: number) => void;
  onObjectAspectLockChange: (locked: boolean) => void;
  onObjectStack: (action: StackAction) => void;
  onObjectAlign: (alignment: PageAlignment) => void;
  onDuplicateObject: () => void;
  onDeleteObject: () => void;
}

function updateEdge(
  setup: PageSetup,
  key: "margins" | "bleed",
  edge: keyof EdgeValues,
  value: number,
): PageSetup {
  return { ...setup, [key]: { ...setup[key], [edge]: value } };
}

function EdgeGroup({
  title,
  values,
  onChange,
}: {
  title: string;
  values: EdgeValues;
  onChange: (edge: keyof EdgeValues, value: number) => void;
}) {
  return (
    <section className="panel-section">
      <h2>{title}</h2>
      <div className="field-grid">
        <NumberField label="Superior" value={values.top} onChange={(value) => onChange("top", value)} />
        <NumberField label="Inferior" value={values.bottom} onChange={(value) => onChange("bottom", value)} />
        <NumberField label="Interna" value={values.inner} onChange={(value) => onChange("inner", value)} />
        <NumberField label="Externa" value={values.outer} onChange={(value) => onChange("outer", value)} />
      </div>
    </section>
  );
}

export function PropertiesPanel({
  setup,
  showMargins,
  showBleed,
  numbering,
  showRulers,
  showCustomGuides,
  snapEnabled,
  guides,
  selectedObject,
  onSetupChange,
  onShowMarginsChange,
  onShowBleedChange,
  onNumberingChange,
  onShowRulersChange,
  onShowCustomGuidesChange,
  onSnapEnabledChange,
  onAddGuide,
  onGuideChange,
  onDeleteGuide,
  onObjectMeasureChange,
  onObjectAspectLockChange,
  onObjectStack,
  onObjectAlign,
  onDuplicateObject,
  onDeleteObject,
}: PropertiesPanelProps) {
  const preset = setup.preset;

  return (
    <aside className="properties-panel" aria-label="Configurações da página">
      <div className="panel-heading">
        <span className="eyebrow">Documento</span>
        <h1>Configuração da página</h1>
        <p>Dimensões e guias do miolo do livro.</p>
      </div>

      <section className="panel-section">
        <h2>Tamanho</h2>
        <label className="select-field">
          <span>Predefinição</span>
          <select
            aria-label="Predefinição de página"
            value={preset ?? "custom"}
            onChange={(event) => {
              const size = PAGE_PRESETS[event.currentTarget.value as keyof typeof PAGE_PRESETS];
              if (size) onSetupChange({
                ...setup,
                ...size,
                preset: event.currentTarget.value as "A4" | "A5",
              });
            }}
          >
            <option value="A5">A5 — 148 × 210 mm</option>
            <option value="A4">A4 — 210 × 297 mm</option>
            <option value="custom">Personalizado</option>
          </select>
        </label>
        <div className="field-grid">
          <NumberField label="Largura" value={setup.width} min={50} onChange={(width) => onSetupChange({ ...setup, width, preset: "custom" })} />
          <NumberField label="Altura" value={setup.height} min={50} onChange={(height) => onSetupChange({ ...setup, height, preset: "custom" })} />
        </div>
      </section>

      <EdgeGroup
        title="Margens"
        values={setup.margins}
        onChange={(edge, value) => onSetupChange(updateEdge(setup, "margins", edge, value))}
      />

      <label className="toggle-row">
        <span>
          <strong>Margens espelhadas</strong>
          <small>Alterna interna e externa no spread.</small>
        </span>
        <input
          type="checkbox"
          checked={setup.mirroredMargins}
          onChange={(event) => onSetupChange({ ...setup, mirroredMargins: event.currentTarget.checked })}
        />
      </label>

      <EdgeGroup
        title="Sangria"
        values={setup.bleed}
        onChange={(edge, value) => onSetupChange(updateEdge(setup, "bleed", edge, value))}
      />

      <section className="panel-section guide-section">
        <h2>Guias</h2>
        <label className="check-row">
          <input type="checkbox" checked={showMargins} onChange={(event) => onShowMarginsChange(event.currentTarget.checked)} />
          <span className="guide-swatch margin-swatch" />
          Linhas de margem
        </label>
        <label className="check-row">
          <input type="checkbox" checked={showBleed} onChange={(event) => onShowBleedChange(event.currentTarget.checked)} />
          <span className="guide-swatch bleed-swatch" />
          Linhas de sangria
        </label>
      </section>

      <PrecisionPanel
        showRulers={showRulers}
        showCustomGuides={showCustomGuides}
        snapEnabled={snapEnabled}
        guides={guides}
        onShowRulersChange={onShowRulersChange}
        onShowCustomGuidesChange={onShowCustomGuidesChange}
        onSnapEnabledChange={onSnapEnabledChange}
        onAddGuide={onAddGuide}
        onGuideChange={onGuideChange}
        onDeleteGuide={onDeleteGuide}
      />

      {selectedObject && (
        <ObjectPropertiesPanel
          object={selectedObject.object}
          pageIndex={selectedObject.pageIndex}
          onMeasureChange={onObjectMeasureChange}
          onAspectLockChange={onObjectAspectLockChange}
          onStack={onObjectStack}
          onAlign={onObjectAlign}
          onDuplicate={onDuplicateObject}
          onDelete={onDeleteObject}
        />
      )}

      <NumberingPanel numbering={numbering} onChange={onNumberingChange} />
    </aside>
  );
}
