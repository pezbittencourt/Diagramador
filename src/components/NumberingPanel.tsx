import { useEffect, useState } from "react";
import type { PageNumbering } from "../domain/document";

interface NumberingPanelProps {
  numbering: PageNumbering;
  onChange: (numbering: PageNumbering) => void;
}

function parseHiddenNumbers(source: string): number[] {
  return [...new Set(
    source
      .split(/[,;\s]+/)
      .map(Number)
      .filter((value) => Number.isInteger(value) && value > 0),
  )].sort((a, b) => a - b);
}

export function NumberingPanel({ numbering, onChange }: NumberingPanelProps) {
  const range = numbering.ranges[0];
  const displayRange = numbering.display.logicalRanges[0] ?? { from: 1 };
  const hiddenValue = numbering.display.hiddenLogicalNumbers.join(", ");
  const [hiddenDraft, setHiddenDraft] = useState(hiddenValue);

  useEffect(() => setHiddenDraft(hiddenValue), [hiddenValue]);

  if (!range) return null;

  const updateRange = (patch: Partial<typeof range>) => {
    onChange({
      ...numbering,
      ranges: [{ ...range, ...patch }, ...numbering.ranges.slice(1)],
    });
  };

  const replaceDisplayRange = (nextDisplayRange: typeof displayRange) => {
    onChange({
      ...numbering,
      display: {
        ...numbering.display,
        logicalRanges: [nextDisplayRange],
      },
    });
  };

  return (
    <section className="panel-section numbering-section" aria-labelledby="numbering-title">
      <h2 id="numbering-title">Numeração editorial</h2>
      <p className="panel-help">
        A contagem e a exibição do número são configuradas separadamente.
      </p>

      <div className="numbering-fields">
        <label className="compact-number-field">
          <span>Começar a contar na página física</span>
          <input
            aria-label="Página física inicial da contagem"
            type="number"
            min="1"
            step="1"
            value={range.fromPhysicalIndex + 1}
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber;
              if (Number.isInteger(value) && value >= 1) {
                updateRange({ fromPhysicalIndex: value - 1 });
              }
            }}
          />
        </label>
        <label className="compact-number-field">
          <span>Essa página corresponde ao número</span>
          <input
            aria-label="Número lógico inicial"
            type="number"
            min="1"
            step="1"
            value={range.logicalStart}
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber;
              if (Number.isInteger(value) && value >= 1) updateRange({ logicalStart: value });
            }}
          />
        </label>
        <label className="compact-number-field">
          <span>Exibir a partir do número lógico</span>
          <input
            aria-label="Número lógico inicial de exibição"
            type="number"
            min="1"
            step="1"
            value={displayRange.from}
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber;
              if (Number.isInteger(value) && value >= 1) {
                replaceDisplayRange({
                  from: value,
                  ...(displayRange.to !== undefined && displayRange.to >= value
                    ? { to: displayRange.to }
                    : {}),
                });
              }
            }}
          />
        </label>
        <label className="compact-number-field">
          <span>Parar de exibir (opcional)</span>
          <input
            aria-label="Número lógico final de exibição"
            type="number"
            min={displayRange.from}
            step="1"
            placeholder="Sem limite"
            value={displayRange.to ?? ""}
            onChange={(event) => {
              const raw = event.currentTarget.value;
              if (raw === "") {
                replaceDisplayRange({ from: displayRange.from });
                return;
              }
              const value = event.currentTarget.valueAsNumber;
              if (Number.isInteger(value) && value >= displayRange.from) {
                replaceDisplayRange({ ...displayRange, to: value });
              }
            }}
          />
        </label>
      </div>

      <label className="select-field numbering-select">
        <span>Formato do número</span>
        <select
          aria-label="Formato da numeração"
          value={range.format}
          onChange={(event) =>
            updateRange({ format: event.currentTarget.value as typeof range.format })
          }
        >
          <option value="arabic">Arábico — 1, 2, 3</option>
          <option value="roman-lower">Romano minúsculo — i, ii, iii</option>
          <option value="roman-upper">Romano maiúsculo — I, II, III</option>
        </select>
      </label>

      <div className="field-grid">
        <label className="select-field numbering-select">
          <span>Posição vertical</span>
          <select
            aria-label="Posição vertical da numeração"
            value={numbering.placement.vertical}
            onChange={(event) => onChange({
              ...numbering,
              placement: {
                ...numbering.placement,
                vertical: event.currentTarget.value as "top" | "bottom",
              },
            })}
          >
            <option value="top">Superior</option>
            <option value="bottom">Inferior</option>
          </select>
        </label>
        <label className="select-field numbering-select">
          <span>Posição horizontal</span>
          <select
            aria-label="Posição horizontal da numeração"
            value={numbering.placement.horizontal}
            onChange={(event) => onChange({
              ...numbering,
              placement: {
                ...numbering.placement,
                horizontal: event.currentTarget.value as "inner" | "outer" | "center",
              },
            })}
          >
            <option value="inner">Interna</option>
            <option value="outer">Externa</option>
            <option value="center">Central</option>
          </select>
        </label>
      </div>

      <label className="text-field hidden-pages-field">
        <span>Ocultar nestes números lógicos</span>
        <input
          aria-label="Números lógicos ocultos"
          type="text"
          inputMode="numeric"
          placeholder="Ex.: 7, 25, 42"
          value={hiddenDraft}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setHiddenDraft(value);
            onChange({
              ...numbering,
              display: {
                ...numbering.display,
                hiddenLogicalNumbers: parseHiddenNumbers(value),
              },
            });
          }}
          onBlur={() => setHiddenDraft(numbering.display.hiddenLogicalNumbers.join(", "))}
        />
        <small>Separe os números por vírgulas. Eles continuam participando da contagem.</small>
      </label>
    </section>
  );
}
