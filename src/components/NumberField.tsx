interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}

export function NumberField({
  label,
  value,
  min = 0,
  max = 1000,
  step = 1,
  onChange,
}: NumberFieldProps) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <span className="number-input-wrap">
        <input
          aria-label={`${label} em milímetros`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number(value.toFixed(3))}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (Number.isFinite(next)) onChange(next);
          }}
        />
        <span>mm</span>
      </span>
    </label>
  );
}
