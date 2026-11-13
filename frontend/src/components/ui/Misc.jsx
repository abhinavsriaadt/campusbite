import { useState } from "react";
import Icon from "./Icon";

export function Card({ as: Tag = "section", pad, interactive, className = "", children, ...rest }) {
  return (
    <Tag className={["card", pad && "card--pad", interactive && "card--interactive", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHead({ title, children }) {
  return (
    <div className="card__head">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function VegMark({ veg }) {
  return (
    <span className={`veg-mark${veg ? "" : " veg-mark--nonveg"}`} role="img" aria-label={veg ? "Vegetarian" : "Non-vegetarian"} title={veg ? "Veg" : "Non-veg"} />
  );
}

/** ★ rating chip — green when ≥ 4, "New" with no ratings. */
export function RatingChip({ value, count }) {
  if (!count) return <span className="rating-chip rating-chip--new">New</span>;
  const v = Number(value);
  return (
    <span className={`rating-chip${v >= 4 ? " rating-chip--good" : ""}`} aria-label={`Rated ${v.toFixed(1)} out of 5 from ${count} ratings`}>
      ★ {v.toFixed(1)}
    </span>
  );
}

export function Stars({ value }) {
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" className={n <= value ? "" : "off"} />)}
    </span>
  );
}

export function StarInput({ value, onChange }) {
  return (
    <div className="stars-input" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={n <= value ? "on" : ""} onClick={() => onChange(n)}
          role="radio" aria-checked={n === value} aria-label={`${n} star${n > 1 ? "s" : ""}`}>
          <Icon name="star" />
        </button>
      ))}
    </div>
  );
}

export function StatCard({ label, value, delta }) {
  return (
    <div className="card stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {delta && <span className="stat__delta">{delta}</span>}
    </div>
  );
}

export function Switch({ checked, onChange, disabled, label }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch__track" aria-hidden />
    </label>
  );
}

export const initialsOf = (name = "") =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "?";

export function Avatar({ name, large }) {
  return <span className={`avatar${large ? " avatar--lg" : ""}`} aria-hidden>{initialsOf(name)}</span>;
}

/** Segmented tabs. `items` = [{ value, label, count? }] */
export function Tabs({ items, value, onChange, label }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Image with a reserved aspect ratio that fades in from a --bg placeholder; a missing or broken
 * image shows a brand-50 block with a line icon (DESIGN.md §2 / §9). */
export function FoodImage({ src, alt = "", square, className = "" }) {
  const [state, setState] = useState("loading");
  const showImg = src && state !== "error";
  return (
    <div className={`food-img${square ? " food-img--square" : ""} ${className}`}>
      {!showImg ? <span className="food-img__art" aria-hidden><Icon name="utensils" /></span> : null}
      {showImg && (
        <img src={src} alt={alt} loading="lazy" decoding="async" className={state === "loaded" ? "is-loaded" : ""}
          onLoad={() => setState("loaded")} onError={() => setState("error")} />
      )}
    </div>
  );
}
