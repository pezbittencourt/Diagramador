import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger" | "ghost";
  icon?: ReactNode;
}

export function Button({ variant = "default", icon, className = "", children, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={`ui-button ui-button-${variant} ${className}`.trim()} {...props}>
    {icon && <span className="ui-button-icon" aria-hidden="true">{icon}</span>}{children}
  </button>;
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  variant?: ButtonProps["variant"];
}

export function IconButton({ label, icon, variant = "ghost", className = "", type = "button", ...props }: IconButtonProps) {
  return <button type={type} aria-label={label} title={props.title ?? label} className={`ui-icon-button ui-button-${variant} ${className}`.trim()} {...props}>{icon}</button>;
}

export function ButtonGroup({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="ui-button-group" role="group" aria-label={label}>{children}</div>;
}
