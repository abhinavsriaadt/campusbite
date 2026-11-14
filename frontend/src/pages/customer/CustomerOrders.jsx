import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ordersApi } from "../../api/endpoints";
import OrderActions from "../../components/OrderActions";
import OrderCard from "../../components/OrderCard";
import {
  Button, EmptyState, ErrorState, FilterBar, FoodImage, ListSkeleton, OrderStepper, Pagination, Skeleton, StatusBadge, Tabs,
} from "../../components/ui";
import { useAsync } from "../../hooks/useAsync";
import { usePaged } from "../../hooks/usePaged";
import { groupByDay, itemSummary, money, timeAgo } from "../../utils/format";
import { ACTIVE_STATUSES } from "../../utils/status";

const PAST_STATUSES = ["DELIVERED", "CANCELLED", "REFUNDED"];

/** Customer dashboard: Active | Past, grouped by day, with status + date filters (brief §6). */
export default function CustomerOrders() {
  const [tab, setTab] = useState("active");
  const [filters, setFilters] = useState({ status: "", date_from: "", date_to: "" });
  const counts = useAsync(() => Promise.all([ordersApi.list({ scope: "active", page_size: 1 }), ordersApi.list({ scope: "history", page_size: 1 })]), []);
  const scope = tab === "active" ? "active" : "history";
  const list = usePaged((page) => ordersApi.list({ ...filters, scope, page, page_size: 10 }), [filters, scope]);

  const switchTab = (t) => { setTab(t); setFilters({ status: "", date_from: "", date_to: "" }); };
  const replace = (o) => { list.setItems((items) => items.map((x) => (x.id === o.id ? { ...x, ...o } : x))); counts.reload(); };

  // The live card is the newest in-progress order, shown above the list on the Active tab.
  const live = tab === "active" && !filters.status && !filters.date_from && !filters.date_to ? list.items[0] : null;
  const rest = live ? list.items.slice(1) : list.items;
  const filtered = filters.status || filters.date_from || filters.date_to;

  return (
    <>
      <div className="page-head">
        <div><h1>My orders</h1><p>Track what&apos;s on the way and manage past orders.</p></div>
        <Button to="/insights" variant="secondary" icon="sparkles">Ask AI about my orders</Button>
      </div>
      <Tabs label="Orders" value={tab} onChange={switchTab} items={[
        { value: "active", label: "Active", count: counts.data?.[0].total },
        { value: "past", label: "Past", count: counts.data?.[1].total },
      ]} />
      <div className="section-sm">
        <FilterBar value={filters} onChange={setFilters} statuses={tab === "active" ? ACTIVE_STATUSES : PAST_STATUSES} />
      </div>

      {list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : !list.loaded ? <ListSkeleton count={3} />
        : !list.items.length ? (
          <EmptyState icon="receipt" title={filtered ? "No orders match these filters" : tab === "active" ? "Nothing on the way" : "No past orders yet"}
            action={filtered ? <Button variant="ghost" onClick={() => setFilters({ status: "", date_from: "", date_to: "" })}>Clear filters</Button>
              : <Link to="/">Browse restaurants →</Link>}>
            {tab === "active" && !filtered ? "Orders you place show up here until they're delivered." : null}
          </EmptyState>
        ) : (
          <div className={list.loading ? "is-refreshing" : ""}>
            {live && <LiveOrder summary={live} onUpdated={replace} />}
            {groupByDay(rest).map((g) => (
              <section key={g.key} className="daygroup" aria-label={g.heading}>
                <h2 className="daygroup__title">{g.heading}</h2>
                <div className="stack">{g.items.map((o) => <OrderCard key={o.id} order={o} onUpdated={replace} />)}</div>
              </section>
            ))}
            <Pagination list={list} />
          </div>
        )}
    </>
  );
}

/** Sticky "live order" card with the stepper. Polls every 20 s while in progress (no websockets needed). */
function LiveOrder({ summary, onUpdated }) {
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => ordersApi.get(summary.id).then((d) => {
      if (!alive) return;
      setDetail(d);
      if (d.status !== summary.status) onUpdated(d);
    }).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.id, summary.status]);
  const o = detail || summary;
  return (
    <article className="card live">
    <Link to={`/orders/${o.id}`} className="live__link" aria-label={`Live order #${o.id}, ${o.restaurant.name}. View details`}>
      <div className="live__head">
        <FoodImage src={o.restaurant.image_url} square className="live__thumb" />
        <div className="grow">
          <span className="eyebrow">Live order · #{o.id}</span>
          <h3 className="truncate">{o.restaurant.name}</h3>
          <span className="text-sm muted clamp-2">{itemSummary(o.items_preview)}</span>
        </div>
        <div className="live__meta">
          <StatusBadge status={o.status} />
          <span className="price strong">{money(o.total_amount)}</span>
        </div>
      </div>
      {detail ? <OrderStepper order={detail} /> : <Skeleton className="skel-line skel-line--lg" />}
      <p className="text-xs muted">Updated {timeAgo(o.status_updated_at)}{o.delivery_partner ? ` · Rider: ${o.delivery_partner.name}` : ""}</p>
    </Link>
    {o.allowed_actions?.length > 0 && (
      <div className="orow__actions"><OrderActions order={o} onUpdated={(u) => { setDetail(null); onUpdated(u); }} /></div>
    )}
    </article>
  );
}
