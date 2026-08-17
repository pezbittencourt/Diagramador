import { useEffect, useState, type FormEvent } from "react";

export interface PdfExportOptions {
  selection: "all" | "range";
  range: string;
  includeBleed: boolean;
}

interface PdfExportDialogProps {
  totalPages: number;
  busy: boolean;
  progress?: string;
  error?: string;
  onCancel: () => void;
  onExport: (options: PdfExportOptions) => void;
}

export function PdfExportDialog({
  totalPages,
  busy,
  progress,
  error,
  onCancel,
  onExport,
}: PdfExportDialogProps) {
  const [selection, setSelection] = useState<PdfExportOptions["selection"]>("all");
  const [range, setRange] = useState(`1-${totalPages}`);
  const [includeBleed, setIncludeBleed] = useState(false);

  useEffect(() => setRange(`1-${totalPages}`), [totalPages]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onExport({ selection, range, includeBleed });
  };

  return (
    <div className="pdf-dialog-backdrop" role="presentation">
      <form
        className="pdf-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-dialog-title"
        onSubmit={submit}
      >
        <header>
          <div>
            <small>SAÍDA EDITORIAL</small>
            <h2 id="pdf-dialog-title">Exportar PDF</h2>
          </div>
          <button type="button" aria-label="Fechar" disabled={busy} onClick={onCancel}>×</button>
        </header>
        <div className="pdf-dialog-body">
          <fieldset disabled={busy}>
            <legend>Páginas físicas</legend>
            <label className="pdf-radio-option">
              <input
                type="radio"
                name="pdf-page-selection"
                checked={selection === "all"}
                onChange={() => setSelection("all")}
              />
              Todas as {totalPages} páginas
            </label>
            <label className="pdf-radio-option pdf-range-option">
              <input
                type="radio"
                name="pdf-page-selection"
                checked={selection === "range"}
                onChange={() => setSelection("range")}
              />
              <span>Intervalo</span>
              <input
                aria-label="Intervalo de páginas físicas"
                type="text"
                value={range}
                disabled={selection !== "range" || busy}
                onFocus={() => setSelection("range")}
                onChange={(event) => setRange(event.currentTarget.value)}
                placeholder="1-10, 15, 20-25"
              />
            </label>
            <p>Use a numeração física mostrada no workspace; intervalos podem ser separados por vírgula.</p>
          </fieldset>
          <label className="pdf-checkbox-option">
            <input
              type="checkbox"
              checked={includeBleed}
              disabled={busy}
              onChange={(event) => setIncludeBleed(event.currentTarget.checked)}
            />
            Incluir sangria no tamanho das páginas
          </label>
          {progress && <div className="pdf-progress" role="status"><span aria-hidden="true" />{progress}</div>}
          {error && <div className="pdf-error" role="alert">{error}</div>}
        </div>
        <footer>
          <button type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Exportando…" : "Escolher destino e exportar"}
          </button>
        </footer>
      </form>
    </div>
  );
}
