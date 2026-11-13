import { PAYMENT_META, RETURN_META, STATUS_META } from "../../utils/status";

/** Pill with a tinted background and strong text (tone: info | warning | success | danger | brand | grey). */
export function Badge({ tone = "grey", dot, children, className = "" }) {
  return (
    <span className={`badge badge--${tone} ${className}`}>
      {dot && <span className="badge__dot" aria-hidden />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, tone: "grey" };
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}

export function PaymentBadge({ status }) {
  const m = PAYMENT_META[status];
  return m ? <Badge tone={m.tone}>{m.label}</Badge> : null;
}

export function ReturnBadge({ status }) {
  const m = RETURN_META[status];
  return m ? <Badge tone={m.tone}>{m.label}</Badge> : null;
}

/** Toggleable filter chip. */
export function Chip({ active, count, children, ...rest }) {
  return (
    <button type="button" className="chip" aria-pressed={!!active} {...rest}>
      {children}
      {count !== undefined && <span className="chip__count">{count}</span>}
    </button>
  );
}
