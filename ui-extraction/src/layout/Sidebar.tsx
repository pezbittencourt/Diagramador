import { useId, useState, type HTMLAttributes, type ReactNode } from "react";

export interface SidebarProps extends HTMLAttributes<HTMLElement> {
  title?: string;
  eyebrow?: string;
  description?: string;
  headerActions?: ReactNode;
}
export function Sidebar({ title, eyebrow, description, headerActions, children, className = "", ...props }: SidebarProps) {
  return <aside className={`ui-sidebar ${className}`.trim()} {...props}>
    {(title || eyebrow || description || headerActions) && <header className="ui-sidebar-heading"><div>{eyebrow && <span className="ui-eyebrow">{eyebrow}</span>}{title && <h1>{title}</h1>}{description && <p>{description}</p>}</div>{headerActions}</header>}
    <div className="ui-sidebar-content">{children}</div>
  </aside>;
}

export interface SidebarSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  disabled?: boolean;
  actions?: ReactNode;
  onOpenChange?: (open: boolean) => void;
}
export function SidebarSection({ title, children, defaultOpen = true, open, disabled, actions, onOpenChange }: SidebarSectionProps) {
  const contentId = useId();
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const isOpen = open ?? localOpen;
  const toggle = () => {
    if (disabled) return;
    const next = !isOpen;
    if (open === undefined) setLocalOpen(next);
    onOpenChange?.(next);
  };
  return <section className={`ui-sidebar-section ${isOpen ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`}>
    <div className="ui-sidebar-section-header">
      <button type="button" aria-expanded={isOpen} aria-controls={contentId} disabled={disabled} onClick={toggle}><span className="ui-disclosure" aria-hidden="true">›</span><span>{title}</span></button>
      {actions && <div className="ui-section-actions">{actions}</div>}
    </div>
    <div id={contentId} className="ui-sidebar-section-content" hidden={!isOpen}>{children}</div>
  </section>;
}

export interface SidebarGroupProps { title?: string; description?: string; children: ReactNode; columns?: 1 | 2 }
export function SidebarGroup({ title, description, children, columns = 1 }: SidebarGroupProps) {
  return <div className={`ui-sidebar-group ui-columns-${columns}`}>{title && <span className="ui-group-title">{title}</span>}{description && <p>{description}</p>}<div className="ui-sidebar-group-content">{children}</div></div>;
}
