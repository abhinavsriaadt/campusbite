import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { catalogApi } from "../../api/endpoints";
import {
  Alert, Chip, ConfirmDialog, DishCard, DishSkeleton, EmptyState, ErrorState, FoodImage, Icon,
  ListSkeleton, Pagination, RatingChip, RowSkeleton, Skeleton, Stars, StickyCartBar, Tabs, VegMark,
} from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { useToast } from "../../context/ToastContext";
import { useAsync, useDebounced } from "../../hooks/useAsync";
import { usePaged } from "../../hooks/usePaged";
import { moneyShort, plural, timeAgo } from "../../utils/format";

export default function RestaurantMenu() {
  const { id } = useParams();
  const rid = Number(id);
  const [params, setParams] = useSearchParams();
  const cart = useCart();
  const restaurant = useAsync(() => catalogApi.restaurant(rid), [rid]);
  const [tab, setTab] = useState("menu");

  if (restaurant.error) return <ErrorState message={restaurant.error} onRetry={restaurant.reload} />;
  if (!restaurant.data) {
    return (
      <div aria-busy="true">
        <Skeleton className="skel-img menu-banner-skel" />
        <div className="card card--pad"><ListSkeleton count={3} Item={DishSkeleton} /></div>
      </div>
    );
  }
  const r = restaurant.data;

  return (
    <div className={cart.count ? "has-cartbar" : ""}>
      <Link to="/" className="back-link"><Icon name="arrowLeft" /> All restaurants</Link>
      <header className={`menu-banner${r.is_open ? "" : " menu-banner--closed"}`}>
        <FoodImage src={r.image_url} alt="" className="menu-banner__img" />
        <div className="menu-banner__copy">
          <h1>{r.name}</h1>
          <p>{[r.cuisine, r.cost_for_two != null ? `${moneyShort(r.cost_for_two)} for two` : null, r.address].filter(Boolean).join(" · ")}</p>
          <div className="row">
            <RatingChip value={r.rating_avg} count={r.rating_count} />
            {r.rating_count > 0 && <span>{plural(r.rating_count, "rating")}</span>}
            <span className={`open-dot open-dot--banner${r.is_open ? "" : " open-dot--closed"}`}>{r.is_open ? "Open now" : "Closed"}</span>
          </div>
        </div>
      </header>
      {r.description && <p className="muted menu-desc">{r.description}</p>}
      {!r.is_open && <Alert type="warning" className="menu-alert">This restaurant isn&apos;t accepting orders right now. You can still browse the menu.</Alert>}

      <Tabs label="Restaurant sections" value={tab} onChange={setTab}
        items={[{ value: "menu", label: "Menu" }, { value: "reviews", label: "Reviews", count: r.rating_count }]} />
      <div className="menu-body">
        {tab === "menu"
          ? <Menu restaurant={r} initialQuery={params.get("dish") || ""} tag={params.get("tag") || ""}
            onClearTag={() => { const next = new URLSearchParams(params); next.delete("tag"); setParams(next, { replace: true }); }} />
          : <Reviews rid={r.id} />}
      </div>
      <StickyCartBar />
    </div>
  );
}

function Menu({ restaurant, initialQuery, tag, onClearTag }) {
  const { user } = useAuth();
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState(initialQuery);
  const [f, setF] = useState({ min_price: "", max_price: "", veg_only: false });
  const [conflict, setConflict] = useState(null);
  const dq = useDebounced(q.trim());
  const minP = useDebounced(f.min_price);
  const maxP = useDebounced(f.max_price);
  const invalid = minP !== "" && maxP !== "" && Number(minP) > Number(maxP);
  const stickyRef = useRef(null);
  const listRef = useRef(null);
  const scrolledFor = useRef(null);

  // Sections arrive grouped by the API (menu order); dishes inside are in menu order too.
  const menu = useAsync(
    () => (invalid ? Promise.resolve(null)
      : catalogApi.menu(restaurant.id, { q: dq, min_price: minP, max_price: maxP, veg_only: f.veg_only })),
    [restaurant.id, dq, f.veg_only, minP, maxP, invalid],
  );
  const categories = useAsync(() => (tag ? catalogApi.categories() : Promise.resolve([])), [tag]);
  const tagName = categories.data?.find((c) => c.slug === tag)?.name || tag;
  const sections = menu.data?.sections || [];
  const matches = tag ? sections.flatMap((sec) => sec.items).filter((d) => d.tags?.includes(tag)).length : 0;

  // Section headers stick just below the filter bar, whatever height it wraps to.
  useEffect(() => {
    const el = stickyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => listRef.current?.style.setProperty("--menu-sticky-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Opened from a category (?tag=rolls): scroll to the first matching dish once.
  useEffect(() => {
    if (!tag || !menu.data || scrolledFor.current === tag) return;
    scrolledFor.current = tag;
    const first = listRef.current?.querySelector(".dish--match");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    first?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [tag, menu.data]);

  const canOrder = restaurant.is_open && (!user || user.role === "customer");
  const inCart = cart.restaurant?.id === restaurant.id;
  // Placeholders show this menu's real price range (from the API), e.g. "₹29" – "₹309".
  const priceHint = (v, label) => (v != null ? moneyShort(v) : `${label} ₹`);

  function add(dish) {
    if (!user) {
      toast.info("Log in to start your order");
      navigate("/login", { state: { from: `/restaurants/${restaurant.id}` } });
      return;
    }
    if (!cart.canAdd(restaurant.id)) return setConflict(dish);
    cart.addItem(restaurant, dish);
  }

  return (
    <>
      <div className="menu-sticky" ref={stickyRef}>
        <div className="search">
          <Icon name="search" />
          <input className="input" type="search" placeholder={`Search ${restaurant.name}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search dishes" />
        </div>
        <div className="menu-sticky__row">
        <div className="menu-sticky__prices">
          <input className="input" type="number" min="0" inputMode="decimal" aria-label="Minimum price"
            placeholder={priceHint(menu.data?.price_min, "Min")} value={f.min_price} onChange={(e) => setF({ ...f, min_price: e.target.value })} />
          <span className="muted" aria-hidden>–</span>
          <input className="input" type="number" min="0" inputMode="decimal" aria-label="Maximum price"
            placeholder={priceHint(menu.data?.price_max, "Max")} value={f.max_price} onChange={(e) => setF({ ...f, max_price: e.target.value })} />
        </div>
        <Chip active={f.veg_only} onClick={() => setF({ ...f, veg_only: !f.veg_only })}><VegMark veg /> Veg only</Chip>
        </div>
      </div>

      {tag && menu.data && (
        <Alert type="info" polite className="menu-alert">
          {matches
            ? <>{plural(matches, `${tagName} dish`, `${tagName} dishes`)} highlighted below. </>
            : <>No {tagName} dishes match here. </>}
          <button type="button" className="linkbtn linkbtn--inline" onClick={onClearTag}>Clear</button>
        </Alert>
      )}

      <div className="card menu-list" ref={listRef}>
        {invalid ? <Alert type="warning">Min price can&apos;t be higher than max price.</Alert>
          : menu.error ? <ErrorState message={menu.error} onRetry={menu.reload} />
          : !menu.data ? <ListSkeleton count={4} Item={DishSkeleton} />
          : !sections.length ? <EmptyState icon="utensils" title="No dishes found">Try a different search or price range.</EmptyState>
          : sections.map((g) => (
            <section key={g.name} className={`menu-group${menu.loading ? " is-refreshing" : ""}`} aria-label={g.name}>
              <h2 className="menu-group__title">{g.name} <span className="muted">{g.items.length}</span></h2>
              {g.items.map((d) => (
                <DishCard key={d.id} dish={d} canOrder={canOrder} qty={inCart ? cart.qtyOf(d.id) : 0}
                  highlight={!!tag && d.tags?.includes(tag)} onAdd={() => add(d)} onQty={(n) => cart.setQuantity(d.id, n)} />
              ))}
            </section>
          ))}
      </div>

      <ConfirmDialog open={!!conflict} title="Start a new cart?" confirmLabel="Start fresh" cancelLabel="Keep current cart"
        onClose={() => setConflict(null)} onConfirm={() => { cart.addItem(restaurant, conflict, { replace: true }); setConflict(null); }}>
        <p>Your cart has items from <b>{cart.restaurant?.name}</b>. An order can only contain dishes from one restaurant. Discard it and add <b>{conflict?.name}</b>?</p>
      </ConfirmDialog>
    </>
  );
}

function Reviews({ rid }) {
  const list = usePaged((page) => catalogApi.reviews(rid, { page, page_size: 10 }), [rid]);
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.loaded) return <ListSkeleton count={3} Item={RowSkeleton} />;
  if (!list.items.length) return <EmptyState icon="star" title="No reviews yet">Order from here and be the first to review.</EmptyState>;
  return (
    <div className="stack">
      {list.items.map((rv) => (
        <article key={rv.id} className="card card--pad stack-sm">
          <div className="row-between"><span className="strong">{rv.customer_name}</span><span className="text-xs muted">{timeAgo(rv.created_at)}</span></div>
          <Stars value={rv.rating} />
          {rv.comment && <p>{rv.comment}</p>}
        </article>
      ))}
      <Pagination list={list} />
    </div>
  );
}
