import type { ReactNode } from "react";

export interface FieldGroupProps { title?: string; description?: string; children: ReactNode; columns?: 1 | 2 | 3 }
export function FieldGroup({ title, description, children, columns = 1 }: FieldGroupProps) {
  return <fieldset className={`ui-field-group ui-columns-${columns}`}><legend>{title}</legend>{description && <p>{description}</p>}<div>{children}</div></fieldset>;
}
