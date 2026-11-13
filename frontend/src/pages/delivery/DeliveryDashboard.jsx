import { useState } from "react";
import { Link } from "react-router-dom";
import { deliveryApi, ordersApi } from "../../api/endpoints";
import OrderActions from "../../components/OrderActions";
import {
  Button, EmptyState, ErrorState, FilterBar, Icon, ListSkeleton, Pagination, StatCard, StatusBadge,
} from "../../components/ui";
import { useAsync } from "../../hooks/useAsync";
import { usePaged } from "../../hooks/usePaged";
import { dateTime, groupByDay, itemSummary, money, plural, timeAgo } from "../../utils/format";

/**
 * Delivery partner screens (mobile-first: large type, 48px targets). The API only returns orders
 * assigned to this partner. `mode="active"` = current jobs, `mode="history"` = completed ones.
 */
export default function DeliveryDashboard({ mode = "active" }) {
  const isHistory = mode === "history";
  const [filters, setFilters] = useState({ status: "", date_from: "", date_to: "" });
  const stats = useAsync(() => deliveryApi.stats(), []);
  const list = usePaged(
    (page) => ordersApi.list({ ...filters, scope: isHistory ? "history" : "active", sort: isHistory ? "newest" : "oldest", page, page_size: 10 }),
    [filters, isHistory],
  );
  const refresh = () => { list.reload(); stats.reload(); };
  const onUpdated = (o) => {
    // Optimistic move, then the server's version. Delivered orders leave the active list.
    list.setItems((items) => items.map((x) => (x.id === o.id ? { ...x, ...o } : x)).filter((x) => isHistory || x.status !== "DELIVERED"));
    stats.reload();
  };

  return (
    <div className="rider">
      <div className="page-head">
        <div>
          <h1>{isHistory ? "Delivery history" : "Your deliveries"}</h1>
          {isHistory
            ? <p className="rider__today">Today: <b>{stats.data ? plural(stats.data.delivered_today, "delivery", "deliveries") : "…"}</b></p>
            : <p>Pick up from the restaurant, then deliver to the customer.</p>}
        </div>
        <Button variant="secondary" size="lg" icon="refresh" onClick={refresh}>Refresh</Button>
      </div>

      {!isHistory && (
        <div className="grid-stats rider__stats">
          <StatCard label="Active now" value={stats.data?.active ?? "—"} />
          <StatCard label="Delivered today" value={stats.data?.delivered_today ?? "—"} />
          <StatCard label="All time" value={stats.data?.delivered_total ?? "—"} />
        </div>
      )}

      <FilterBar value={filters} onChange={setFilters} showDates={isHistory}
        statuses={isHistory ? ["DELIVERED", "REFUNDED"] : ["ASSIGNED", "OUT_FOR_DELIVERY"]} />

      {list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : !list.loaded ? <ListSkeleton count={2} />
        : !list.items.length ? (
          <EmptyState icon={isHistory ? "package" : "bike"} title={isHistory ? "No completed deliveries yet" : "No deliveries right now"}>
            {isHistory ? "Orders you deliver will show up here." : "When a restaurant assigns you an order, it appears here."}
          </EmptyState>
        ) : isHistory ? (
          <div className={list.loading ? "is-refreshing" : ""}>
            {groupByDay(list.items, "delivered_at").map((g, i, all) => (
              <section key={g.key} className="daygroup" aria-label={g.heading}>
                {/* Only the last day on a page can be cut off by pagination, so it gets no count until complete. */}
                <h2 className="daygroup__title">{g.heading}{(i < all.length - 1 || !list.hasMore) && <span className="muted"> · {plural(g.items.length, "delivery", "deliveries")}</span>}</h2>
                <ul className="card rider-history">
                  {g.items.map((o) => (
                    <li key={o.id}>
                      <Link to={`/orders/${o.id}`} className="rider-history__row">
                        <span className="grow">
                          <span className="strong">#{o.id} · {o.restaurant.name}</span>
                          <span className="text-sm muted block truncate">{o.customer.name} · {o.delivery_address}</span>
                        </span>
                        <span className="rider-history__meta">
                          <StatusBadge status={o.status} />
                          <span className="text-xs muted">{dateTime(o.delivered_at)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <Pagination list={list} />
          </div>
        ) : (
          <div className={`stack${list.loading ? " is-refreshing" : ""}`}>
            {list.items.map((o) => <DeliveryCard key={o.id} order={o} onUpdated={onUpdated} />)}
            <Pagination list={list} />
          </div>
        )}
    </div>
  );
}

function DeliveryCard({ order: o, onUpdated }) {
  const phone = o.contact_phone || o.customer.phone;
  return (
    <article className="card dcard">
      <div className="row-between">
        <Link to={`/orders/${o.id}`} className="dcard__id">Order #{o.id}</Link>
        <StatusBadge status={o.status} />
      </div>
      <ol className="dcard__route">
        <li>
          <span className="dcard__pin dcard__pin--from"><Icon name="store" /></span>
          <span className="grow">
            <span className="eyebrow">Pick up</span>
            <span className="dcard__place">{o.restaurant.name}</span>
            {o.restaurant.phone && <a href={`tel:${o.restaurant.phone}`} className="dcard__tel"><Icon name="phone" /> Call restaurant</a>}
          </span>
        </li>
        <li>
          <span className="dcard__pin dcard__pin--to"><Icon name="pin" /></span>
          <span className="grow">
            <span className="eyebrow">Deliver to</span>
            <span className="dcard__place">{o.customer.name}</span>
            <span className="dcard__addr">{o.delivery_address}</span>
            {phone && <a href={`tel:${phone}`} className="dcard__tel"><Icon name="phone" /> {phone}</a>}
          </span>
        </li>
      </ol>
      <div className="row-between dcard__foot">
        <span className="text-sm muted">{itemSummary(o.items_preview)}</span>
        <span className="price dcard__total">{money(o.total_amount)}</span>
      </div>
      <span className="text-xs muted">{o.status === "ASSIGNED" ? "Assigned" : "Picked up"} {timeAgo(o.status_updated_at)}</span>
      <div className="dcard__cta"><OrderActions order={o} onUpdated={onUpdated} size="lg" block /></div>
    </article>
  );
}
