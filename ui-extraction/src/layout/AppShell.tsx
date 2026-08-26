import type { CSSProperties, ReactNode } from "react";

export interface AppShellProps {
  appName: string;
  appSubtitle?: string;
  logo?: ReactNode;
  headerCenter?: ReactNode;
  actions?: ReactNode;
  sidebar: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  statusBar?: ReactNode;
  accentColor?: string;
}

export function AppShell({ appName, appSubtitle, logo, headerCenter, actions, sidebar, toolbar, children, statusBar, accentColor }: AppShellProps) {
  const style = accentColor ? ({ "--ui-accent": accentColor } as CSSProperties) : undefined;
  return <div className={`ui-app-shell ${statusBar ? "" : "ui-app-shell-no-status"}`.trim()} style={style}>
    <header className="ui-app-bar">
      <div className="ui-brand">{logo && <span className="ui-brand-logo" aria-hidden="true">{logo}</span>}<span><strong>{appName}</strong>{appSubtitle && <small>{appSubtitle}</small>}</span></div>
      <div className="ui-header-center">{headerCenter}</div>
      <div className="ui-app-actions">{actions}</div>
    </header>
    <div className="ui-app-content">
      {sidebar}
      <main className="ui-workspace">{toolbar}{children}</main>
    </div>
    {statusBar && <footer className="ui-status-bar">{statusBar}</footer>}
  </div>;
}
