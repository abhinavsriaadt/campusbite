import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Theme preference: "light" | "dark" | "system", stored in localStorage as `cb_theme`.
 * The resolved theme is written to <html data-theme>. index.html runs the same logic inline
 * before React mounts, so a reload in dark mode never flashes white (DESIGN.md §2).
 */
const KEY = "cb_theme";
const QUERY = "(prefers-color-scheme: dark)";
const ThemeContext = createContext(null);

function readPref() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

const systemTheme = () => (window.matchMedia?.(QUERY).matches ? "dark" : "light");

function apply(resolved) {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  // Match the mobile browser bar to the page background.
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && bg) meta.setAttribute("content", bg);
}

export function ThemeProvider({ children }) {
  const [pref, setPrefState] = useState(readPref);
  const [system, setSystem] = useState(systemTheme);
  const resolved = pref === "system" ? system : pref;

  // Follow the OS live (only matters while pref is "system").
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return undefined;
    const onChange = (e) => setSystem(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => { apply(resolved); }, [resolved]);

  const setPref = useCallback((next) => {
    setPrefState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch { /* storage blocked: the choice still applies for this session */ }
  }, []);

  const toggle = useCallback(() => setPref(resolved === "dark" ? "light" : "dark"), [resolved, setPref]);

  const value = useMemo(() => ({ pref, resolved, setPref, toggle }), [pref, resolved, setPref, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
