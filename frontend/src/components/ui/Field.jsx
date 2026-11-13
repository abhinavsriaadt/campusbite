import { cloneElement, isValidElement, useId } from "react";

/**
 * Label above, error (or hint) below. `children` is either a render function `(id, describedBy) => <input …/>`
 * or a single element, which receives `id`, `aria-describedby` and `aria-invalid` automatically.
 */
export default function Field({ label, hint, error, children, className = "" }) {
  const id = useId();
  const msgId = `${id}-msg`;
  const describedBy = error || hint ? msgId : undefined;
  let control = typeof children === "function" ? children(id, describedBy) : children;
  if (typeof children !== "function" && isValidElement(control)) {
    control = cloneElement(control, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined });
  }
  return (
    <div className={`field ${className}`}>
      {label && <label className="field__label" htmlFor={id}>{label}</label>}
      {control}
      {error ? <span id={msgId} className="field__error">{error}</span> : hint ? <span id={msgId} className="field__hint">{hint}</span> : null}
    </div>
  );
}

export const Input = (props) => <input className="input" {...props} />;
export const Select = ({ children, ...props }) => <select className="select" {...props}>{children}</select>;
export const Textarea = (props) => <textarea className="textarea" {...props} />;
