import { Link } from "react-router-dom";
import { Logo, LogoMonoWhite, ThemeToggle } from "../../components/ui";

// Free Unsplash photo (hotlinked per Unsplash guidelines); checked by eye to be a food spread.
const PHOTO = "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1400&q=70";

/** Desktop: food photo (white logo over a dark scrim) on the left, form on the right. Mobile: the form only.
 *  The full logo sits above the form at 40px on every size (DESIGN.md §4). */
export default function AuthLayout({ children }) {
  return (
    <div className="auth">
      <aside className="auth__media" aria-hidden>
        <img src={PHOTO} alt="" />
        <div className="auth__media-copy">
          <LogoMonoWhite height={32} decorative />
          <div>
            <h1>Great food from your favourite kitchens, delivered.</h1>
            <p>Order from local restaurants, follow every step to your door, and ask AI about your order history.</p>
          </div>
        </div>
      </aside>
      <main id="main" className="auth__panel">
        <ThemeToggle className="auth__theme" />
        <div className="auth__card">
          <Link to="/" className="auth__brand" aria-label="CampusBite home"><Logo height={40} decorative /></Link>
          {children}
        </div>
      </main>
    </div>
  );
}
