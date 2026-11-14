import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ordersApi } from "../../api/endpoints";
import OrderActions from "../../components/OrderActions";
import OrderCard from "../../components/OrderCard";
import {
  Alert, Button, EmptyState, ErrorState, FilterBar, Icon, ListSkeleton, Pagination, RowSkeleton, StatusBadge, Tabs,
} from "../../components/ui";
import { usePaged, useMediaQuery } from "../../hooks/usePaged";
import { minutesSince, money, timeAgo, waitLabel } from "../../utils/format";
import { ALL_STATUSES, STALE_MINUTES, STALE_STATUSES } from "../../utils/status";

const COLUMNS = [
  { key: "new", label: "New", statuses: ["PLACED"] },
  { key: "accepted", label: "Accepted", statuses: ["ACCEPTED"] },
  { key: "preparing", label: "Preparing", statuses: ["PREPARING"] },
  { key: "ready", label: "Ready", statuses: ["READY"] },
  { key: "out", label: "Out", statuses: ["ASSIGNED", "OUT_FOR_DELIVERY"] },
];
const BOARD_LIMIT = 100; // API page-size maximum
const POLL_MS = 30000;

export default function OwnerOrders() {
  const [view, setView] = useState("board");
  return (
    <>
      <div className="page-head">
        <div><h1>Orders</h1><p>Accept, prepare and dispatch orders for your restaurant.</p></div>
        <Tabs label="View" value={view} onChange={setView} items={[{ value: "board", label: "Board" }, { value: "table", label: "All orders" }]} />
      </div>
      {view === "board" ? <Board /> : <OrderTable />}
    </>
  );
}

/** Live Kanban of in-progress orders. Refreshes every 30 s while the tab is visible. */
function Board() {
  const isMobile = useMediaQuery("(max-width: 899px)");
  const [state, setState] = useState({ items: null, total: 0, error: null, loading: true });
  const [col, setCol] = useState("new");

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const d = await ordersApi.list({ scope: "active", sort: "oldest", page_size: BOARD_LIMIT });
      setState({ items: d.items, total: d.total, error: null, loading: false });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.response?.data?.detail || "Couldn't load orders." }));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Optimistic + server updates from OrderActions: replace the card (it moves column), drop it when finished.
  const onUpdated = (o) => setState((s) => ({
    ...s,
    items: s.items.map((x) => (x.id === o.id ? { ...x, ...o } : x)).filter((x) => COLUMNS.some((c) => c.statuses.includes(x.status))),
  }));

  if (state.error && !state.items) return <ErrorState message={state.error} onRetry={load} />;
  if (!state.items) return <div className="kanban">{COLUMNS.map((c) => <div key={c.key} className="kanban__col"><ListSkeleton count={2} Item={RowSkeleton} /></div>)}</div>;

  const byCol = Object.fromEntries(COLUMNS.map((c) => [c.key, state.items.filter((o) => c.statuses.includes(o.status))]));
  const visible = isMobile ? COLUMNS.filter((c) => c.key === col) : COLUMNS;

  return (
    <>
      <div className="row-between board__bar">
        <span className="text-sm muted">{state.total} active order{state.total === 1 ? "" : "s"} · refreshes every 30 s</span>
        <Button variant="ghost" size="sm" icon="refresh" loading={state.loading} onClick={load}>Refresh</Button>
      </div>
      {state.total > BOARD_LIMIT && <Alert type="info">Showing the {BOARD_LIMIT} oldest active orders. Use &quot;All orders&quot; to see the rest.</Alert>}
      {isMobile && (
        <Tabs label="Board columns" value={col} onChange={setCol} items={COLUMNS.map((c) => ({ value: c.key, label: c.label, count: byCol[c.key].length }))} />
      )}
      <div className="kanban">
        {visible.map((c) => (
          <section key={c.key} className="kanban__col" aria-label={`${c.label} (${byCol[c.key].length})`}>
            {!isMobile && <h2 className="kanban__title">{c.label} <span className="count">{byCol[c.key].length}</span></h2>}
            {byCol[c.key].length === 0
              ? <p className="kanban__empty">No orders</p>
              : byCol[c.key].map((o) => <KanbanCard key={`${o.id}-${c.key}`} order={o} onUpdated={onUpdated} />)}
          </section>
        ))}
      </div>
    </>
  );
}

function KanbanCard({ order, onUpdated }) {
  const waited = minutesSince(order.status_updated_at);
  const stale = STALE_STATUSES.includes(order.status) && waited >= STALE_MINUTES;
  return (
    <article className={`card kcard${stale ? " kcard--stale" : ""}`}>
      <div className="row-between">
        <Link to={`/orders/${order.id}`} className="strong kcard__id">#{order.id}</Link>
        <span className="text-xs muted">{timeAgo(order.created_at)}</span>
      </div>
      {stale && <span className="kcard__stale"><Icon name="clock" /> Waiting {waitLabel(waited)}</span>}
      <ul className="kcard__items">
        {order.items_preview.map((i, n) => <li key={n}><span className="num strong">{i.quantity}×</span> {i.name}</li>)}
      </ul>
      <div className="row-between">
        <span className="text-sm muted truncate">{order.customer.name}</span>
        <span className="price strong">{money(order.total_amount)}</span>
      </div>
      {order.status === "OUT_FOR_DELIVERY" || order.status === "ASSIGNED" ? (
        <div className="row-between text-sm">
          <StatusBadge status={order.status} />
          {order.delivery_partner && <span className="row-nowrap muted"><Icon name="bike" /> {order.delivery_partner.name}</span>}
        </div>
      ) : null}
      <div className="kcard__actions"><OrderActions order={order} onUpdated={onUpdated} block /></div>
    </article>
  );
}

/** Table view: every order with status + date filters, sort and pagination (brief §2B/§6). */
function OrderTable() {
  const [filters, setFilters] = useState({ status: "", date_from: "", date_to: "" });
  const [sort, setSort] = useState("newest");
  const list = usePaged((page) => ordersApi.list({ ...filters, sort, page, page_size: 10 }), [filters, sort]);
  const replace = (o) => list.setItems((items) => items.map((x) => (x.id === o.id ? { ...x, ...o } : x)));
  return (
    <>
      <FilterBar value={filters} onChange={setFilters} statuses={ALL_STATUSES} />
      <div className="row-between list-count">
        <span className="text-sm muted">{list.loaded ? `${list.total} order${list.total === 1 ? "" : "s"}` : " "}</span>
        <label className="row-nowrap text-sm">Sort
          <select className="select select--inline" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
          </select>
        </label>
      </div>
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : !list.loaded ? <ListSkeleton count={4} />
        : !list.items.length ? <EmptyState icon="receipt" title="No orders found">Try a different status or date range.</EmptyState>
        : (
          <div className={`stack${list.loading ? " is-refreshing" : ""}`}>
            {list.items.map((o) => <OrderCard key={o.id} order={o} perspective="owner" onUpdated={replace} />)}
            <Pagination list={list} />
          </div>
        )}
    </>
  );
}
