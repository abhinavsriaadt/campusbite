import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { catalogApi } from "../../api/endpoints";
import {
  Alert, Chip, ConfirmDialog, DishCard, DishSkeleton, EmptyState, ErrorState, FoodImage, Icon,
  ListSkeleton, Pagination, RatingChip, RowSkeleton, Skeleton, Stars, StickyCartBar, Tabs,
} from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { useToast } from "../../context/ToastContext";
import { useAsync, useDebounced } from "../../hooks/useAsync";
import { usePaged } from "../../hooks/usePaged";
import { PRICE_RANGES } from "../../utils/constants";
import { plural, timeAgo } from "../../utils/format";

export default function RestaurantMenu() {
  const { id } = useParams();
  const rid = Number(id);
  const [params] = useSearchParams();
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
          <p>{[r.cuisine, r.address].filter(Boolean).join(" · ")}</p>
          <div className="row">
            <RatingChip value={r.rating_avg} count={r.rating_count} />
            {r.rating_count > 0 && <span>{plural(r.rating_count, "rating")}</span>}
            <span className={`open-dot open-dot--banner${r.is_open ? "" : " open-dot--closed"}`}>{r.is_open ? "Open now" : "Closed"}</span>
          </div>
        </div>
      </header>
      {r.description && <p className="muted menu-desc">{r.description}</p>}
      {!r.is_open && <Alert type="warning" className="menu-alert">This restaurant isn't accepting orders right now. You can still browse the menu.</Alert>}

      <Tabs label="Restaurant sections" value={tab} onChange={setTab}
        items={[{ value: "menu", label: "Menu" }, { value: "reviews", label: "Reviews", count: r.rating_count }]} />
      <div className="menu-body">
        {tab === "menu" ? <Menu restaurant={r} initialQuery={params.get("dish") || ""} /> : <Reviews rid={r.id} />}
      </div>
      <StickyCartBar />
    </div>
  );
}

function Menu({ restaurant, initialQuery }) {
  const { user } = useAuth();
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState(initialQuery);
  const [f, setF] = useState({ range: "", min_price: "", max_price: "", veg_only: false });
  const [page, setPage] = useState(1);
  const [conflict, setConflict] = useState(null);
  const dq = useDebounced(q.trim());
  const minP = useDebounced(f.min_price);
  const maxP = useDebounced(f.max_price);
  const invalid = minP !== "" && maxP !== "" && Number(minP) > Number(maxP);

  const menu = useAsync(
    () => (invalid ? Promise.resolve(null)
      : catalogApi.menu(restaurant.id, { q: dq, min_price: minP, max_price: maxP, veg_only: f.veg_only, sort: "name", page, page_size: 100 })),
    [restaurant.id, dq, f.veg_only, minP, maxP, page, invalid],
  );
  const setRange = (key) => {
    const r = PRICE_RANGES.find((x) => x.key === key);
    setF({ ...f, range: f.range === key ? "" : key, min_price: f.range === key ? "" : r.min, max_price: f.range === key ? "" : r.max });
    setPage(1);
  };
  const canOrder = restaurant.is_open && (!user || user.role === "customer");
  const inCart = cart.restaurant?.id === restaurant.id;

  // Group by category in the restaurant's category order; uncategorised last.
  const groups = useMemo(() => {
    const items = menu.data?.items || [];
    const order = [...restaurant.categories, null];
    return order
      .map((c) => ({ category: c, items: items.filter((d) => (d.category || null) === c) }))
      .filter((g) => g.items.length);
  }, [menu.data, restaurant.categories]);

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
      <div className="menu-sticky">
        <div className="search">
          <Icon name="search" />
          <input className="input" type="search" placeholder={`Search ${restaurant.name}`} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search dishes" />
        </div>
        <div className="chips" role="group" aria-label="Price range">
          {PRICE_RANGES.map((r) => <Chip key={r.key} active={f.range === r.key} onClick={() => setRange(r.key)}>{r.label}</Chip>)}
          <Chip active={f.veg_only} onClick={() => { setF({ ...f, veg_only: !f.veg_only }); setPage(1); }}>Veg only</Chip>
        </div>
        <div className="menu-sticky__prices">
          <input className="input" type="number" min="0" inputMode="decimal" placeholder="Min ₹" aria-label="Minimum price" value={f.min_price}
            onChange={(e) => { setF({ ...f, range: "", min_price: e.target.value }); setPage(1); }} />
          <span className="muted" aria-hidden>–</span>
          <input className="input" type="number" min="0" inputMode="decimal" placeholder="Max ₹" aria-label="Maximum price" value={f.max_price}
            onChange={(e) => { setF({ ...f, range: "", max_price: e.target.value }); setPage(1); }} />
        </div>
      </div>

      <div className="card menu-list">
        {invalid ? <Alert type="warning">Min price can't be higher than max price.</Alert>
          : menu.error ? <ErrorState message={menu.error} onRetry={menu.reload} />
          : !menu.data ? <ListSkeleton count={4} Item={DishSkeleton} />
          : !groups.length ? <EmptyState icon="utensils" title="No dishes found">Try a different search or price range.</EmptyState>
          : groups.map((g) => (
            <section key={g.category || "other"} className={`menu-group${menu.loading ? " is-refreshing" : ""}`} aria-label={g.category || "Other"}>
              <h2 className="menu-group__title">{g.category || "Other"} <span className="muted">{g.items.length}</span></h2>
              {g.items.map((d) => (
                <DishCard key={d.id} dish={d} canOrder={canOrder} qty={inCart ? cart.qtyOf(d.id) : 0}
                  onAdd={() => add(d)} onQty={(n) => cart.setQuantity(d.id, n)} />
              ))}
            </section>
          ))}
      </div>
      {menu.data && <Pagination page={page} pages={menu.data.pages} onChange={setPage} />}

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
