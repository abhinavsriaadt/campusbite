import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { ROLE_LABEL } from "../utils/constants";
import { useTheme } from "../context/ThemeContext";
import { Avatar, Button, Icon, ThemeChoice, ThemeToggle } from "./ui";

const NAV = {
  customer: [
    { to: "/", label: "Home", icon: "home", end: true, desktop: false },
    { to: "/orders", label: "Orders", icon: "receipt" },
    { to: "/insights", label: "AI Insights", short: "Insights", icon: "sparkles" },
    { to: "/cart", label: "Cart", icon: "cart", desktop: false, badge: "cart" },
  ],
  restaurant_owner: [
    { to: "/owner", label: "Dashboard", icon: "grid", end: true },
    { to: "/owner/orders", label: "Orders", icon: "layout" },
    { to: "/owner/menu", label: "Menu", icon: "book" },
    { to: "/owner/returns", label: "Returns", icon: "rotate" },
  ],
  delivery_partner: [
    { to: "/delivery", label: "Deliveries", icon: "bike", end: true },
    { to: "/delivery/history", label: "History", icon: "clock" },
  ],
};

function Brand() {
  return (
    <Link to="/" className="brand" aria-label="CampusBite home">
      <span className="brand__mark" aria-hidden>C</span>
      <span className="brand__name">CampusBite</span>
    </Link>
  );
}

function CartBadge({ count, bump }) {
  const [anim, setAnim] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    setAnim(true);
    const t = setTimeout(() => setAnim(false), 400);
    return () => clearTimeout(t);
  }, [bump]);
  if (!count) return null;
  return <span className={`nav-badge${anim ? " bounce" : ""}`} aria-hidden>{count > 99 ? "99+" : count}</span>;
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="usermenu" ref={ref}>
      <button type="button" className="usermenu__trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        aria-label={`Account menu for ${user.name}`}>
        <Avatar name={user.name} />
        <span className="usermenu__name">{user.name.split(" ")[0]}</span>
        <Icon name="chevronDown" className="usermenu__chev" />
      </button>
      {open && (
        <div className="usermenu__panel" role="menu">
          <div className="usermenu__who">
            <span className="strong truncate">{user.name}</span>
            <span className="text-xs muted">{ROLE_LABEL[user.role]}</span>
          </div>
          <div className="usermenu__theme"><span className="eyebrow">Theme</span><ThemeChoice /></div>
          <Link role="menuitem" to="/profile" className="usermenu__item"><Icon name="user" />Profile</Link>
          {user.role === "restaurant_owner" && (
            <Link role="menuitem" to="/owner/settings" className="usermenu__item"><Icon name="store" />Restaurant settings</Link>
          )}
          <button role="menuitem" type="button" className="usermenu__item" onClick={onLogout}><Icon name="logout" />Log out</button>
        </div>
      )}
    </div>
  );
}

function NavSearch() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  const [q, setQ] = useState(location.pathname === "/" ? params.get("q") || "" : "");
  useEffect(() => { if (location.pathname === "/") setQ(params.get("q") || ""); }, [location.pathname, params]);
  return (
    <form role="search" className="search topnav__search" onSubmit={(e) => { e.preventDefault(); navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : "/"); }}>
      <Icon name="search" />
      <input className="input" type="search" placeholder="Search restaurants or cuisines" aria-label="Search restaurants" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  );
}

function NavItems({ items, cart, variant }) {
  return items.map((l) => (
    <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `${variant}__link${isActive ? " is-active" : ""}`}>
      <span className="navicon">
        <Icon name={l.icon} />
        {l.badge === "cart" && <CartBadge count={cart.count} bump={cart.bump} />}
      </span>
      <span>{variant === "tabbar" ? l.short || l.label : l.label}</span>
    </NavLink>
  ));
}

function SidebarThemeToggle() {
  const { resolved, toggle } = useTheme();
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={`Switch to ${resolved === "dark" ? "light" : "dark"} theme`}>
      <Icon name={resolved === "dark" ? "sun" : "moon"} /><span>{resolved === "dark" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}

/** App chrome per role. Auth pages render without it. */
export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const cart = useCart();
  const navigate = useNavigate();
  const role = user?.role;
  const items = NAV[role] || [];
  const isOwner = role === "restaurant_owner";
  const isCustomerish = !user || role === "customer";
  const onLogout = () => { logout(); navigate("/login"); };

  return (
    <div className={`app${items.length ? " app--tabbar" : ""}${isOwner ? " app--sidebar" : ""}`}>
      <a href="#main" className="skip-link">Skip to content</a>

      {isOwner && (
        <aside className="sidebar" aria-label="Restaurant navigation">
          <Brand />
          <nav className="sidebar__nav"><NavItems items={items} cart={cart} variant="sidebar" /></nav>
          <div className="sidebar__foot">
            <NavLink to="/owner/settings" className={({ isActive }) => `sidebar__link${isActive ? " is-active" : ""}`}>
              <span className="navicon"><Icon name="store" /></span><span>Restaurant</span>
            </NavLink>
            <SidebarThemeToggle />
            <UserMenu user={user} onLogout={onLogout} />
          </div>
        </aside>
      )}

      <header className={`topnav${isOwner ? " topnav--owner" : ""}`}>
        <div className="topnav__inner">
          <Brand />
          {isCustomerish && <NavSearch />}
          {!isOwner && items.length > 0 && (
            <nav className="topnav__links" aria-label="Main">
              <NavItems items={items.filter((l) => l.desktop !== false)} cart={cart} variant="topnav" />
            </nav>
          )}
          <div className="topnav__right">
            <ThemeToggle />
            {isCustomerish && (
              <Link to="/cart" className="topnav__cart" aria-label={`Cart, ${cart.count} item${cart.count === 1 ? "" : "s"}`}>
                <span className="navicon"><Icon name="cart" /><CartBadge count={cart.count} bump={cart.bump} /></span>
              </Link>
            )}
            {user ? <UserMenu user={user} onLogout={onLogout} /> : (
              <>
                <Button to="/login" variant="ghost" size="sm">Log in</Button>
                <Button to="/register" variant="primary" size="sm" className="topnav__signup">Sign up</Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="main">{children}</main>

      {items.length > 0 && (
        <nav className="tabbar" aria-label="Main">
          <NavItems items={items} cart={cart} variant="tabbar" />
        </nav>
      )}
    </div>
  );
}
