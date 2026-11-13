import { useTheme } from "../../context/ThemeContext";
import Icon from "./Icon";

/** Sun/moon icon button that flips between light and dark (DESIGN.md §2). */
export function ThemeToggle({ className = "" }) {
  const { resolved, toggle } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <button type="button" className={`icon-btn ${className}`} onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      <Icon name={resolved === "dark" ? "sun" : "moon"} />
    </button>
  );
}

const OPTIONS = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "monitor" },
];

/** Light / Dark / System segmented choice, used in the avatar menu and the styleguide. */
export function ThemeChoice() {
  const { pref, setPref } = useTheme();
  return (
    <div className="theme-choice" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={pref === o.value} onClick={() => setPref(o.value)}>
          <Icon name={o.icon} /><span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
