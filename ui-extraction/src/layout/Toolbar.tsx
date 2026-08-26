import type { HTMLAttributes, ReactNode } from "react";

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> { label: string }
export function Toolbar({ label, children, className = "", ...props }: ToolbarProps) {
  return <div className={`ui-toolbar ${className}`.trim()} role="toolbar" aria-label={label} {...props}>{children}</div>;
}

export interface ToolbarGroupProps { label?: string; children: ReactNode; align?: "start" | "end" }
export function ToolbarGroup({ label, children, align = "start" }: ToolbarGroupProps) {
  return <div className={`ui-toolbar-group ui-toolbar-${align}`} role="group" aria-label={label}>{children}</div>;
}
