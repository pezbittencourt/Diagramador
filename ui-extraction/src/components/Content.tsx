import type { HTMLAttributes, ReactNode } from "react";

export function Label({ children, ...props }: HTMLAttributes<HTMLSpanElement>) { return <span className="ui-label" {...props}>{children}</span>; }
export function HelpText({ children, ...props }: HTMLAttributes<HTMLParagraphElement>) { return <p className="ui-help" {...props}>{children}</p>; }
export function Divider() { return <hr className="ui-divider" />; }

export interface PanelProps extends HTMLAttributes<HTMLElement> { title?: string; actions?: ReactNode }
export function Panel({ title, actions, children, className = "", ...props }: PanelProps) {
  return <section className={`ui-panel ${className}`.trim()} {...props}>{(title || actions) && <header><h2>{title}</h2>{actions}</header>}<div className="ui-panel-body">{children}</div></section>;
}

export interface CardProps extends HTMLAttributes<HTMLElement> { title?: string; eyebrow?: string; actions?: ReactNode }
export function Card({ title, eyebrow, actions, children, className = "", ...props }: CardProps) {
  return <article className={`ui-card ${className}`.trim()} {...props}><header><div>{eyebrow && <span className="ui-eyebrow">{eyebrow}</span>}{title && <h3>{title}</h3>}</div>{actions}</header><div className="ui-card-body">{children}</div></article>;
}

export interface StatusIndicatorProps { status?: "neutral" | "success" | "warning" | "error"; label: string; detail?: string }
export function StatusIndicator({ status = "neutral", label, detail }: StatusIndicatorProps) {
  return <span className={`ui-status ui-status-${status}`}><i aria-hidden="true" /><span>{label}{detail && <small>{detail}</small>}</span></span>;
}

export interface EmptyStateProps { title: string; description?: string; icon?: ReactNode; action?: ReactNode }
export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return <div className="ui-empty-state">{icon && <span className="ui-empty-icon" aria-hidden="true">{icon}</span>}<h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}
