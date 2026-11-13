import Button from "./Button";
import Icon from "./Icon";

export function Spinner({ small, label = "Loading" }) {
  return <span className={`spinner${small ? " spinner--sm" : ""}`} role="progressbar" aria-label={label} />;
}

export function PageLoader({ label = "Loading…" }) {
  return (
    <div className="page-loader" role="status">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

/** One line icon, one sentence, one action (DESIGN.md §3). */
export function EmptyState({ icon = "package", title, children, action, className = "" }) {
  return (
    <div className={`empty ${className}`}>
      <span className="empty__icon"><Icon name={icon} /></span>
      {title && <h3>{title}</h3>}
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="empty empty--error" role="alert">
      <span className="empty__icon"><Icon name="alert" /></span>
      <h3>Something went wrong</h3>
      <p>{message}</p>
      {onRetry && <Button variant="secondary" icon="refresh" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

const ALERT_ICON = { error: "alert", warning: "alert", info: "info", success: "check" };

/** `polite` announces the message without interrupting (role=status instead of role=alert). */
export function Alert({ type = "error", children, className = "", polite = false }) {
  if (!children) return null;
  return (
    <div className={`alert alert--${type} ${className}`} role={type === "error" && !polite ? "alert" : "status"}>
      <Icon name={ALERT_ICON[type]} />
      <div className="grow">{children}</div>
    </div>
  );
}
