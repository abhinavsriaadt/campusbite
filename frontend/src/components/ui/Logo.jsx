import { useTheme } from "../../context/ThemeContext";
import appIconDark from "../../assets/brand/app-icon-dark.svg";
import appIcon from "../../assets/brand/app-icon.svg";
import logoMonoWhite from "../../assets/brand/logo-mono-white.svg";
import logoOnDark from "../../assets/brand/logo-on-dark.svg";
import logoOnLight from "../../assets/brand/logo-on-light.svg";

// The brand files are final artwork (brand/ folder): rendered as-is, never redrawn or recoloured.
const RATIO = 629 / 120; // wordmark viewBox

/**
 * CampusBite logo.
 *  variant="full": the wordmark, light or dark artwork following the theme.
 *  variant="mark": the square app-icon tile.
 * Width and height are always set, so the logo never shifts layout while loading.
 * `theme` forces one artwork (styleguide); `decorative` hides it from assistive tech when the
 * surrounding link already names it.
 */
export default function Logo({ variant = "full", height = 32, theme, className = "", decorative = false }) {
  const { resolved } = useTheme();
  const dark = (theme || resolved) === "dark";
  const a11y = decorative ? { alt: "", "aria-hidden": true } : { alt: "CampusBite", "aria-label": "CampusBite" };
  if (variant === "mark") {
    return (
      <img src={dark ? appIconDark : appIcon} width={height} height={height} decoding="async"
        className={`logo logo--mark ${className}`} {...a11y} />
    );
  }
  return (
    <img src={dark ? logoOnDark : logoOnLight} width={Math.round(height * RATIO)} height={height} decoding="async"
      className={`logo ${className}`} {...(decorative ? a11y : { alt: "CampusBite" })} />
  );
}

/** White wordmark for brand-coloured or photo backgrounds (the auth hero panel). */
export function LogoMonoWhite({ height = 32, className = "", decorative = false }) {
  return (
    <img src={logoMonoWhite} width={Math.round(height * RATIO)} height={height} decoding="async"
      className={`logo ${className}`} alt={decorative ? "" : "CampusBite"} aria-hidden={decorative || undefined} />
  );
}
