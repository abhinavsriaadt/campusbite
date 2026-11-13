import { Link } from "react-router-dom";
import Icon from "./Icon";
import { Spinner } from "./States";

/**
 * variant: primary | secondary | ghost | danger | danger-outline | success
 * size: md (default) | sm | lg.  `loading` shows a spinner and blocks double clicks.
 * Pass `to` to render a router Link styled as a button.
 */
export default function Button({
  variant = "secondary", size, block, loading = false, icon, iconRight, iconOnly, to, className = "", children, disabled, type = "button", ...rest
}) {
  const cls = [
    "btn", `btn--${variant}`, size && size !== "md" && `btn--${size}`, block && "btn--block", iconOnly && "btn--icon", className,
  ].filter(Boolean).join(" ");
  const content = (
    <>
      {loading ? <Spinner small /> : icon && <Icon name={icon} />}
      {children}
      {iconRight && !loading && <Icon name={iconRight} />}
    </>
  );
  if (to) return <Link to={to} className={cls} {...rest}>{content}</Link>;
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
}
