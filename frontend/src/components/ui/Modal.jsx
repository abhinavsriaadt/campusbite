import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Button from "./Button";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Centered modal on desktop, bottom sheet on mobile (<640px). `variant="drawer"` slides in from the right on desktop.
 * Escape and backdrop click close it; focus is trapped inside and restored afterwards.
 */
export default function Modal({ open, title, onClose, children, footer, variant = "sheet" }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = ref.current?.querySelector("input, textarea, select") || ref.current?.querySelector(FOCUSABLE);
    first?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") closeRef.current?.();
      if (e.key !== "Tab" || !ref.current) return;
      const nodes = [...ref.current.querySelectorAll(FOCUSABLE)];
      if (!nodes.length) return;
      const [a, z] = [nodes[0], nodes[nodes.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className={`overlay${variant === "drawer" ? " overlay--drawer" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} className={`modal${variant === "drawer" ? " modal--drawer" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <h2>{title}</h2>
          <Button variant="ghost" iconOnly icon="x" aria-label="Close" onClick={onClose} />
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Confirm step for destructive / irreversible actions (DESIGN.md §6). */
export function ConfirmDialog({ open, title, children, confirmLabel = "Confirm", variant = "primary", busy, onConfirm, onClose, cancelLabel = "Cancel" }) {
  return (
    <Modal open={open} title={title} onClose={busy ? undefined : onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
        <Button variant={variant} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </>}>
      {children}
    </Modal>
  );
}
