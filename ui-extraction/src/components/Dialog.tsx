import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, IconButton } from "./Button";

export interface DialogProps {
  open: boolean;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  onClose: () => void;
}

export function Dialog({ open, title, eyebrow, children, footer, closeLabel = "Fechar", onClose }: DialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", keydown);
    return () => { window.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="ui-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} tabIndex={-1} className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><div>{eyebrow && <span className="ui-eyebrow">{eyebrow}</span>}<h2 id={titleId}>{title}</h2></div><IconButton label={closeLabel} icon="×" onClick={onClose} /></header>
      <div className="ui-dialog-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </div>
  </div>;
}

export interface ConfirmDialogProps extends Omit<DialogProps, "footer"> { confirmLabel?: string; cancelLabel?: string; busy?: boolean; onConfirm: () => void }
export function ConfirmDialog({ confirmLabel = "Confirmar", cancelLabel = "Cancelar", busy, onConfirm, onClose, ...props }: ConfirmDialogProps) {
  return <Dialog {...props} onClose={onClose} footer={<><Button disabled={busy} onClick={onClose}>{cancelLabel}</Button><Button variant="primary" disabled={busy} onClick={onConfirm}>{confirmLabel}</Button></>}>{props.children}</Dialog>;
}

export const Modal = Dialog;
