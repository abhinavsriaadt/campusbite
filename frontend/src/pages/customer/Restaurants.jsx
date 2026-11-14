import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { catalogApi } from "../../api/endpoints";
import {
  Chip, EmptyState, ErrorState, Field, FoodImage, Icon, Pagination, RestaurantCard, RestaurantCardSkeleton, Skeleton, StickyCartBar, Tabs, VegMark,
} from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { useAsync, useDebounced } from "../../hooks/useAsync";
import { usePaged } from "../../hooks/usePaged";
import { money } from "../../utils/format";

export default function Restaurants() {
  const { user } = useAuth();
  const cart = useCart();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "dishes" ? "dishes" : "restaurants");
  const [q, setQ] = useState(params.get("q") || "");
  const debounced = useDebounced(q.trim());

  // Adopt ?q= only when it changed from outside (the navbar search), never echoing our own writes.
  useEffect(() => {
    const pq = params.get("q") || "";
    if (pq !== debounced) setQ(pq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  useEffect(() => {
    const next = new URLSearchParams(params);
    debounced ? next.set("q", debounced) : next.delete("q");
    tab === "dishes" ? next.set("tab", "dishes") : next.delete("tab");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, tab]);

  return (
    <div className={cart.count ? "has-cartbar" : ""}>
      <section className="hero">
        <h1>{user ? `Hungry, ${user.name.split(" ")[0]}?` : "Hungry? We've got you."}</h1>
        <p>Order from restaurants around campus and track it to your door.</p>
        <div className="search search--lg hero__search">
          <Icon name="search" />
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={tab === "restaurants" ? "Search restaurants or cuisines" : "Search dishes, e.g. paneer, pizza"} aria-label="Search" />
        </div>
      </section>
      <div className="row-between home__tabs">
        <Tabs label="Browse" value={tab} onChange={setTab} items={[{ value: "restaurants", label: "Restaurants" }, { value: "dishes", label: "Dishes" }]} />
      </div>
      {tab === "restaurants" ? <RestaurantList q={debounced} /> : <DishList q={debounced} />}
      <StickyCartBar />
    </div>
  );
}

function RestaurantList({ q }) {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") || "";
  // Chip row: categories with their restaurant counts, plus the overall total for "All".
  const chips = useAsync(() => Promise.all([catalogApi.categories(), catalogApi.restaurants({ page_size: 1 })]), []);
  const list = usePaged((page) => catalogApi.restaurants({ q, category, page, page_size: 12 }), [q, category]);
  const [cats, all] = chips.data || [[], null];
  const current = cats.find((c) => c.slug === category);

  const setCategory = (slug) => {
    const next = new URLSearchParams(params);
    slug ? next.set("category", slug) : next.delete("category");
    setParams(next);
  };

  return (
    <>
      <div className="chips home__chips" role="group" aria-label="Filter by category" aria-busy={chips.loading || undefined}>
        {chips.error ? (
          <button type="button" className="linkbtn" onClick={chips.reload}>Couldn't load categories. Retry</button>
        ) : !chips.data ? (
          Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="skel-chip" />)
        ) : (
          <>
            <Chip active={!category} count={all?.total} onClick={() => setCategory("")}>All</Chip>
            {cats.map((c) => (
              <Chip key={c.slug} active={category === c.slug} count={c.restaurant_count} title={c.description || undefined}
                onClick={() => setCategory(category === c.slug ? "" : c.slug)}>{c.name}</Chip>
            ))}
          </>
        )}
      </div>
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : !list.loaded ? <div className="grid-cards">{Array.from({ length: 6 }, (_, i) => <RestaurantCardSkeleton key={i} />)}</div>
        : !list.items.length ? (
          <EmptyState icon="search" title={current && !q ? `No ${current.name} restaurants yet` : "No restaurants found"}
            action={(q || category) && <Link to="/">Show all restaurants</Link>}>
            Try a different name or category.
          </EmptyState>
        ) : (
          <>
            <p className="text-sm muted list-count">
              {list.loading ? "Updating…" : <>{list.total} restaurant{list.total === 1 ? "" : "s"}{current ? ` in ${current.name}` : ""}</>}
            </p>
            <div className={`grid-cards${list.loading ? " is-refreshing" : ""}`}>
              {list.items.map((r) => <RestaurantCard key={r.id} r={r} search={category ? `?tag=${encodeURIComponent(category)}` : ""} />)}
            </div>
            <Pagination list={list} />
          </>
        )}
    </>
  );
}

function DishList({ q }) {
  const [f, setF] = useState({ min_price: "", max_price: "", veg_only: false, sort: "name" });
  const minP = useDebounced(f.min_price);
  const maxP = useDebounced(f.max_price);
  const invalid = minP !== "" && maxP !== "" && Number(minP) > Number(maxP);
  const list = usePaged(
    (page) => (invalid ? Promise.resolve({ items: [], total: 0, page: 1, pages: 1 })
      : catalogApi.dishes({ q, min_price: minP, max_price: maxP, veg_only: f.veg_only, sort: f.sort, page, page_size: 12 })),
    [q, minP, maxP, f.veg_only, f.sort, invalid],
  );
  const set = (patch) => setF({ ...f, ...patch });

  return (
    <>
      <div className="toolbar">
        <Field label="Min price (₹)" error={invalid ? "Must be lower than max" : null}>
          <input className="input" type="number" min="0" inputMode="decimal" value={f.min_price} onChange={(e) => set({ min_price: e.target.value })} />
        </Field>
        <Field label="Max price (₹)"><input className="input" type="number" min="0" inputMode="decimal" value={f.max_price} onChange={(e) => set({ max_price: e.target.value })} /></Field>
        <Field label="Sort">
          <select className="select" value={f.sort} onChange={(e) => set({ sort: e.target.value })}>
            <option value="name">Name</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option>
          </select>
        </Field>
        <label className="checkbox"><input type="checkbox" checked={f.veg_only} onChange={(e) => set({ veg_only: e.target.checked })} /> Veg only</label>
      </div>
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : !list.loaded ? <div className="grid-dishes">{Array.from({ length: 6 }, (_, i) => <div key={i} className="card dishtile"><Skeleton className="skel-thumb" /><div className="grow stack-sm"><Skeleton className="skel-line" width="70%" /><Skeleton className="skel-line" width="30%" /></div></div>)}</div>
        : !list.items.length ? <EmptyState icon="utensils" title="No dishes match">Adjust your search or price range.</EmptyState>
        : (
          <>
            <div className={`grid-dishes${list.loading ? " is-refreshing" : ""}`}>
              {list.items.map((d) => (
                <Link key={d.id} to={`/restaurants/${d.restaurant_id}?dish=${encodeURIComponent(d.name)}`} className="card card--interactive dishtile">
                  <FoodImage src={d.image_url} alt="" square className="dishtile__img" />
                  <div className="grow stack-sm">
                    <span className="row-nowrap"><VegMark veg={d.is_veg} /><span className="strong truncate">{d.name}</span></span>
                    <span className="price strong">{money(d.price)}</span>
                    <span className="text-xs muted truncate">from {d.restaurant_name}</span>
                  </div>
                </Link>
              ))}
            </div>
            <Pagination list={list} />
          </>
        )}
    </>
  );
}
