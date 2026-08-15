import { useState } from "react";
import type { ParagraphStyle } from "../domain/document";

interface StyleEditorProps {
  styles: ParagraphStyle[];
  onChange: (styles: ParagraphStyle[]) => void;
  onClose: () => void;
}

type NumericStyleKey = keyof Pick<ParagraphStyle,
  "fontSizePt" | "fontWeight" | "lineHeight" | "spaceBeforePt" | "spaceAfterPt"
  | "firstLineIndentMm" | "leftIndentMm" | "rightIndentMm"
>;

export function StyleEditor({ styles, onChange, onClose }: StyleEditorProps) {
  const [selectedId, setSelectedId] = useState(styles[0]?.id ?? "body");
  const current = styles.find((style) => style.id === selectedId) ?? styles[0];
  if (!current) return null;

  const update = (patch: Partial<ParagraphStyle>) => {
    onChange(styles.map((style) => style.id === current.id ? { ...style, ...patch } : style));
  };
  const number = (key: NumericStyleKey, value: string) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) update({ [key]: parsed });
  };

  return (
    <div className="style-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="style-editor" role="dialog" aria-modal="true" aria-labelledby="style-editor-title">
        <header>
          <div><span className="eyebrow">Estilos editoriais</span><h2 id="style-editor-title">Editar estilos</h2></div>
          <button type="button" aria-label="Fechar editor de estilos" onClick={onClose}>×</button>
        </header>
        <div className="style-editor-body">
          <nav aria-label="Lista de estilos">
            {styles.map((style) => (
              <button
                type="button"
                key={style.id}
                className={style.id === current.id ? "active" : ""}
                onClick={() => setSelectedId(style.id)}
              >{style.name}<small>{style.id}</small></button>
            ))}
          </nav>
          <div className="style-fields">
            <label><span>Nome</span><input aria-label="Nome do estilo" value={current.name} onChange={(event) => update({ name: event.currentTarget.value })} /></label>
            <label><span>Família</span><input aria-label="Família do estilo" value={current.fontFamily} onChange={(event) => update({ fontFamily: event.currentTarget.value })} /></label>
            <label><span>Tamanho (pt)</span><input aria-label="Tamanho do estilo" type="number" min="6" step="0.5" value={current.fontSizePt} onChange={(event) => number("fontSizePt", event.currentTarget.value)} /></label>
            <label><span>Peso</span><select value={current.fontWeight} onChange={(event) => number("fontWeight", event.currentTarget.value)}><option value="400">Regular</option><option value="700">Negrito</option></select></label>
            <label className="style-check"><input type="checkbox" checked={current.italic} onChange={(event) => update({ italic: event.currentTarget.checked })} /><span>Itálico</span></label>
            <label className="style-check"><input type="checkbox" checked={current.underline} onChange={(event) => update({ underline: event.currentTarget.checked })} /><span>Sublinhado</span></label>
            <label><span>Alinhamento</span><select value={current.alignment} onChange={(event) => update({ alignment: event.currentTarget.value as ParagraphStyle["alignment"] })}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option><option value="justify">Justificado</option></select></label>
            <label><span>Altura de linha</span><input type="number" min="0.8" max="3" step="0.05" value={current.lineHeight} onChange={(event) => number("lineHeight", event.currentTarget.value)} /></label>
            <label><span>Espaço antes (pt)</span><input type="number" min="0" value={current.spaceBeforePt} onChange={(event) => number("spaceBeforePt", event.currentTarget.value)} /></label>
            <label><span>Espaço depois (pt)</span><input type="number" min="0" value={current.spaceAfterPt} onChange={(event) => number("spaceAfterPt", event.currentTarget.value)} /></label>
            <label><span>Primeira linha (mm)</span><input type="number" step="0.5" value={current.firstLineIndentMm} onChange={(event) => number("firstLineIndentMm", event.currentTarget.value)} /></label>
            <label><span>Recuo esquerdo (mm)</span><input type="number" min="0" step="0.5" value={current.leftIndentMm} onChange={(event) => number("leftIndentMm", event.currentTarget.value)} /></label>
            <label><span>Recuo direito (mm)</span><input type="number" min="0" step="0.5" value={current.rightIndentMm} onChange={(event) => number("rightIndentMm", event.currentTarget.value)} /></label>
            <label><span>Cor</span><input type="color" value={current.color} onChange={(event) => update({ color: event.currentTarget.value })} /></label>
          </div>
        </div>
        <footer><span>Alterações são aplicadas imediatamente a todos os parágrafos vinculados.</span><button type="button" onClick={onClose}>Salvar e fechar</button></footer>
      </aside>
    </div>
  );
}
