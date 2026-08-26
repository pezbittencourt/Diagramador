import { useId, type InputHTMLAttributes } from "react";

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label: string;
  description?: string;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, description, id, checked, disabled, onChange, ...props }: ToggleProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return <label className={`ui-toggle ${disabled ? "is-disabled" : ""}`} htmlFor={inputId}>
    <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
    <input {...props} id={inputId} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
  </label>;
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label: string;
  onChange: (checked: boolean) => void;
}
export function Checkbox({ label, id, checked, onChange, ...props }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return <label className="ui-checkbox" htmlFor={inputId}><input {...props} id={inputId} type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} /><span>{label}</span></label>;
}

export interface SegmentedOption<T extends string> { value: T; label: string; disabled?: boolean }
export interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  disabled?: boolean;
  onChange: (value: T) => void;
}
export function SegmentedControl<T extends string>({ label, value, options, disabled, onChange }: SegmentedControlProps<T>) {
  return <div className="ui-segmented" role="group" aria-label={label}>{options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} className={value === option.value ? "is-active" : ""} disabled={disabled || option.disabled} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}
