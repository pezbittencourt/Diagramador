import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

interface FieldFrameProps {
  label: string;
  inputId: string;
  helpText?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

function FieldFrame({ label, inputId, helpText, error, children, className = "" }: FieldFrameProps) {
  const descriptionId = `${inputId}-description`;
  return <label className={`ui-field ${error ? "ui-field-error" : ""} ${className}`.trim()} htmlFor={inputId}>
    <span className="ui-field-label">{label}</span>
    {children}
    {(error || helpText) && <small id={descriptionId} className={error ? "ui-error-text" : "ui-help-text"}>{error ?? helpText}</small>}
  </label>;
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  helpText?: string;
  error?: string;
}

export function TextField({ label, helpText, error, id, className, ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return <FieldFrame label={label} inputId={inputId} helpText={helpText} error={error}>
    <input {...props} id={inputId} type="text" className={className} aria-invalid={Boolean(error)} aria-describedby={(error || helpText) ? `${inputId}-description` : undefined} />
  </FieldFrame>;
}

export interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label: string;
  value: number | "";
  unit?: string;
  helpText?: string;
  error?: string;
  onChange: (value: number | "") => void;
}

export function NumberField({ label, value, unit, helpText, error, id, onChange, ...props }: NumberFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return <FieldFrame label={label} inputId={inputId} helpText={helpText} error={error}>
    <span className="ui-number-wrap">
      <input {...props} id={inputId} type="number" value={value} aria-invalid={Boolean(error)} aria-describedby={(error || helpText) ? `${inputId}-description` : undefined} onChange={(event) => onChange(event.currentTarget.value === "" ? "" : event.currentTarget.valueAsNumber)} />
      {unit && <span aria-hidden="true">{unit}</span>}
    </span>
  </FieldFrame>;
}

export interface SelectOption { value: string; label: string; disabled?: boolean }
export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label: string;
  options: SelectOption[];
  helpText?: string;
  error?: string;
  onChange: (value: string) => void;
}

export function SelectField({ label, options, helpText, error, id, onChange, ...props }: SelectFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return <FieldFrame label={label} inputId={inputId} helpText={helpText} error={error}>
    <select {...props} id={inputId} aria-invalid={Boolean(error)} aria-describedby={(error || helpText) ? `${inputId}-description` : undefined} onChange={(event) => onChange(event.currentTarget.value)}>
      {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
  </FieldFrame>;
}

export interface ColorFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> { label: string }
export function ColorField({ label, id, ...props }: ColorFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return <FieldFrame label={label} inputId={inputId}><input {...props} id={inputId} className="ui-color-input" type="color" /></FieldFrame>;
}
