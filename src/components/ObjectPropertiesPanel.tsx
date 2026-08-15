import type { PositionedImageObject } from "../domain/document";
import type { PageAlignment, StackAction } from "../domain/objectGeometry";
import { NumberField } from "./NumberField";

interface ObjectPropertiesPanelProps {
  object: PositionedImageObject;
  pageIndex: number;
  onMeasureChange: (measure: "x" | "y" | "width" | "height", value: number) => void;
  onAspectLockChange: (locked: boolean) => void;
  onStack: (action: StackAction) => void;
  onAlign: (alignment: PageAlignment) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function ObjectPropertiesPanel({
  object,
  pageIndex,
  onMeasureChange,
  onAspectLockChange,
  onStack,
  onAlign,
  onDuplicate,
  onDelete,
}: ObjectPropertiesPanelProps) {
  return (
    <section className="panel-section object-properties" aria-label="Propriedades da imagem selecionada">
      <h2>Imagem · página {pageIndex + 1}</h2>
      <div className="field-grid">
        <NumberField label="X" value={object.x} min={-1000} step={0.5} onChange={(value) => onMeasureChange("x", value)} />
        <NumberField label="Y" value={object.y} min={-1000} step={0.5} onChange={(value) => onMeasureChange("y", value)} />
        <NumberField label="Largura" value={object.width} min={1} step={0.5} onChange={(value) => onMeasureChange("width", value)} />
        <NumberField label="Altura" value={object.height} min={1} step={0.5} onChange={(value) => onMeasureChange("height", value)} />
      </div>
      <label className="compact-check-row">
        <input
          type="checkbox"
          checked={object.lockAspectRatio}
          onChange={(event) => onAspectLockChange(event.currentTarget.checked)}
        />
        Manter proporção ({object.originalAspectRatio.toFixed(3)})
      </label>
      <div className="object-command-group">
        <span>Alinhar à página</span>
        <div className="command-grid align-grid">
          <button type="button" onClick={() => onAlign("left")} title="Esquerda">Esq.</button>
          <button type="button" onClick={() => onAlign("horizontal-center")} title="Centro horizontal">Centro H</button>
          <button type="button" onClick={() => onAlign("right")} title="Direita">Dir.</button>
          <button type="button" onClick={() => onAlign("top")} title="Topo">Topo</button>
          <button type="button" onClick={() => onAlign("vertical-center")} title="Centro vertical">Centro V</button>
          <button type="button" onClick={() => onAlign("bottom")} title="Base">Base</button>
        </div>
      </div>
      <div className="object-command-group">
        <span>Empilhamento</span>
        <div className="command-grid stack-grid">
          <button type="button" onClick={() => onStack("front")}>Frente</button>
          <button type="button" onClick={() => onStack("forward")}>Avançar</button>
          <button type="button" onClick={() => onStack("backward")}>Recuar</button>
          <button type="button" onClick={() => onStack("back")}>Fundo</button>
        </div>
      </div>
      <div className="object-footer-actions">
        <button type="button" onClick={onDuplicate}>Duplicar</button>
        <button type="button" className="danger-button" onClick={onDelete}>Excluir</button>
      </div>
      <p className="panel-help object-shortcuts">Setas: 0,5 mm · Shift+seta: 5 mm · Ctrl+D duplica</p>
    </section>
  );
}
