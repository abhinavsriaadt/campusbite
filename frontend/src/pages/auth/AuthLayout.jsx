import { Link } from "react-router-dom";

// Free Unsplash photo (hotlinked per Unsplash guidelines); checked by eye to be a food spread.
const PHOTO = "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1400&q=70";

/** Desktop: food photo on the left, form on the right. Mobile: the form only (DESIGN.md §4). */
export default function AuthLayout({ children }) {
  return (
    <div className="auth">
      <aside className="auth__media" aria-hidden>
        <img src={PHOTO} alt="" />
        <div className="auth__media-copy">
          <span className="brand brand--light"><span className="brand__mark">C</span><span className="brand__name">CampusBite</span></span>
          <div>
            <h1>Great food from your favourite kitchens, delivered.</h1>
            <p>Order from local restaurants, follow every step to your door, and ask AI about your order history.</p>
          </div>
        </div>
      </aside>
      <main id="main" className="auth__panel">
        <Link to="/" className="brand auth__brand" aria-label="CampusBite home"><span className="brand__mark" aria-hidden>C</span><span className="brand__name">CampusBite</span></Link>
        <div className="auth__card">{children}</div>
      </main>
    </div>
  );
}
