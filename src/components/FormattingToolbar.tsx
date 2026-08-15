import type { ParagraphStyle } from "../domain/document";
import type { SelectionFormatting } from "../domain/textStory";
import type { EditorCommandRequest } from "./editorCommands";

interface FormattingToolbarProps {
  styles: ParagraphStyle[];
  formatting: SelectionFormatting;
  onCommand: (command: EditorCommandRequest) => void;
  onEditStyles: () => void;
}

const FONT_FAMILIES = ["Georgia", "Garamond", "Times New Roman", "Arial", "Verdana"];

function keepSelection(event: React.MouseEvent<HTMLElement>) {
  event.preventDefault();
}

function numericValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function FormattingToolbar({
  styles,
  formatting,
  onCommand,
  onEditStyles,
}: FormattingToolbarProps) {
  const inline = (
    mark: "bold" | "italic" | "underline",
    current: boolean | null,
  ) => onCommand({ type: "inline", mark, value: current !== true });
  const paragraphNumber = (
    property: "lineHeight" | "spaceBeforePt" | "spaceAfterPt" | "firstLineIndentMm" | "leftIndentMm" | "rightIndentMm",
    value: string,
    fallback: number,
  ) => onCommand({ type: "paragraph", property, value: numericValue(value, fallback) });

  return (
    <div className="format-toolbar" aria-label="Formatação de texto">
      <div className="format-group style-format-group">
        <label>
          <span>Estilo</span>
          <select
            aria-label="Estilo de parágrafo"
            value={formatting.styleId ?? ""}
            onChange={(event) => onCommand({ type: "style", styleId: event.currentTarget.value })}
          >
            {formatting.styleId === null && <option value="" disabled>— Misto —</option>}
            {styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
          </select>
        </label>
        <button type="button" className="edit-styles-button" onMouseDown={keepSelection} onClick={onEditStyles}>
          Editar estilos
        </button>
      </div>

      <div className="format-group inline-format-group">
        <label>
          <span>Fonte</span>
          <select
            aria-label="Família tipográfica"
            value={formatting.fontFamily ?? ""}
            onChange={(event) => onCommand({ type: "inline", mark: "fontFamily", value: event.currentTarget.value })}
          >
            {formatting.fontFamily === null && <option value="" disabled>— Mista —</option>}
            {FONT_FAMILIES.map((family) => <option key={family} value={family}>{family}</option>)}
          </select>
        </label>
        <label className="small-format-field">
          <span>Tamanho</span>
          <input
            aria-label="Tamanho da fonte"
            type="number"
            min="6"
            max="144"
            step="0.5"
            placeholder={formatting.fontSizePt === null ? "Misto" : undefined}
            value={formatting.fontSizePt ?? ""}
            onChange={(event) => onCommand({
              type: "inline",
              mark: "fontSize",
              value: numericValue(event.currentTarget.value, 11),
            })}
          />
        </label>
        <div className="format-button-row" aria-label="Ênfase">
          <button aria-label="Negrito" className={formatting.fontWeight === null ? "mixed" : formatting.fontWeight >= 600 ? "active" : ""} aria-pressed={formatting.fontWeight === null ? "mixed" : formatting.fontWeight >= 600} type="button" onMouseDown={keepSelection} onClick={() => inline("bold", formatting.fontWeight === null ? null : formatting.fontWeight >= 600)}><strong>N</strong></button>
          <button aria-label="Itálico" className={formatting.italic === null ? "mixed" : formatting.italic ? "active" : ""} aria-pressed={formatting.italic === null ? "mixed" : formatting.italic} type="button" onMouseDown={keepSelection} onClick={() => inline("italic", formatting.italic)}><em>I</em></button>
          <button aria-label="Sublinhado" className={formatting.underline === null ? "mixed" : formatting.underline ? "active" : ""} aria-pressed={formatting.underline === null ? "mixed" : formatting.underline} type="button" onMouseDown={keepSelection} onClick={() => inline("underline", formatting.underline)}><u>S</u></button>
        </div>
        <label className="color-format-field">
          <span>{formatting.color === null ? "Cor · mista" : "Cor"}</span>
          <input aria-label="Cor do texto" type="color" value={formatting.color ?? "#222520"} onChange={(event) => onCommand({ type: "inline", mark: "textColor", value: event.currentTarget.value })} />
        </label>
      </div>

      <div className="format-group paragraph-format-group">
        <div className="format-button-row" aria-label="Alinhamento">
          {(["left", "center", "right", "justify"] as const).map((alignment) => (
            <button
              key={alignment}
              type="button"
              className={formatting.alignment === alignment ? "active" : ""}
              aria-label={{ left: "Alinhar à esquerda", center: "Centralizar", right: "Alinhar à direita", justify: "Justificar" }[alignment]}
              aria-pressed={formatting.alignment === alignment}
              onMouseDown={keepSelection}
              onClick={() => onCommand({ type: "paragraph", property: "alignment", value: alignment })}
            >{{ left: "≡", center: "≣", right: "≡", justify: "☰" }[alignment]}</button>
          ))}
        </div>
        <label className="small-format-field"><span>Entrelinha</span><input aria-label="Altura de linha" type="number" min="0.8" max="3" step="0.05" value={formatting.lineHeight ?? ""} placeholder="Misto" onChange={(event) => paragraphNumber("lineHeight", event.currentTarget.value, 1.35)} /></label>
        <label className="small-format-field"><span>Antes</span><input aria-label="Espaço antes" type="number" min="0" step="1" value={formatting.spaceBeforePt ?? ""} placeholder="Misto" onChange={(event) => paragraphNumber("spaceBeforePt", event.currentTarget.value, 0)} /></label>
        <label className="small-format-field"><span>Depois</span><input aria-label="Espaço depois" type="number" min="0" step="1" value={formatting.spaceAfterPt ?? ""} placeholder="Misto" onChange={(event) => paragraphNumber("spaceAfterPt", event.currentTarget.value, 0)} /></label>
        <label className="small-format-field"><span>1ª linha</span><input aria-label="Recuo de primeira linha" type="number" step="0.5" value={formatting.firstLineIndentMm ?? ""} placeholder="Misto" onChange={(event) => paragraphNumber("firstLineIndentMm", event.currentTarget.value, 0)} /></label>
        <label className="small-format-field"><span>Esquerdo</span><input aria-label="Recuo esquerdo" type="number" min="0" step="0.5" value={formatting.leftIndentMm ?? ""} placeholder="Misto" onChange={(event) => paragraphNumber("leftIndentMm", event.currentTarget.value, 0)} /></label>
        <label className="small-format-field"><span>Direito</span><input aria-label="Recuo direito" type="number" min="0" step="0.5" value={formatting.rightIndentMm ?? ""} placeholder="Misto" onChange={(event) => paragraphNumber("rightIndentMm", event.currentTarget.value, 0)} /></label>
      </div>
    </div>
  );
}
