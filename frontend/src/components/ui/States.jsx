import Button from "./Button";
import Icon from "./Icon";
import Logo from "./Logo";

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
/** Full-height brand splash while the session is checked: the mark with a gentle pulse. */
export function Splash({ label = "Loading…" }) {
  return (
    <div className="splash" role="status">
      <Logo variant="mark" height={56} className="splash__mark" decorative />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** `media` replaces the icon (e.g. the logo on the 404 page). */
export function EmptyState({ icon = "package", media, title, children, action, className = "" }) {
  return (
    <div className={`empty ${className}`}>
      {media || <span className="empty__icon"><Icon name={icon} /></span>}
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
