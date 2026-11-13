import { Link } from "react-router-dom";
import { errorMessage } from "../../api/client";
import { ordersApi, ownerApi } from "../../api/endpoints";
import RevenueChart from "../../components/RevenueChart";
import {
  Badge, Button, Card, CardHead, EmptyState, ErrorState, Icon, ListSkeleton, Skeleton, StatCard, StatusBadge,
} from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { useAsync } from "../../hooks/useAsync";
import { itemSummary, minutesSince, money, plural, timeAgo, waitLabel } from "../../utils/format";
import { STATUS_META } from "../../utils/status";

export default function OwnerDashboard() {
  const toast = useToast();
  const restaurant = useAsync(() => ownerApi.restaurant(), []);
  const stats = useAsync(() => ownerApi.stats(), []);
  const reminders = useAsync(() => ownerApi.reminders({ page_size: 10 }), []);
  const recent = useAsync(() => ordersApi.list({ sort: "newest", page_size: 8 }), []);

  const refreshAll = () => { stats.reload(); reminders.reload(); recent.reload(); };

  async function dismiss(id) {
    const before = reminders.data;
    reminders.setData((d) => d && { ...d, items: d.items.filter((r) => r.id !== id), total: d.total - 1 }); // optimistic
    try {
      await ownerApi.dismissReminder(id);
    } catch (err) {
      reminders.setData(before);
      toast.error(errorMessage(err));
    }
  }

  if (stats.error) return <ErrorState message={stats.error} onRetry={stats.reload} />;
  const s = stats.data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{restaurant.data?.name || "Dashboard"}</h1>
          <p className="row">
            {restaurant.data && <Badge tone={restaurant.data.is_open ? "success" : "grey"} dot>{restaurant.data.is_open ? "Open for orders" : "Closed"}</Badge>}
            <span>Here's how today is going.</span>
          </p>
        </div>
        <div className="row">
          <Button variant="secondary" icon="refresh" onClick={refreshAll} aria-label="Refresh dashboard">Refresh</Button>
          <Button to="/owner/orders" variant="primary" iconRight="arrowRight">Order board</Button>
        </div>
      </div>

      <div className="grid-stats">
        {!s ? Array.from({ length: 4 }, (_, i) => <div key={i} className="card stat"><Skeleton className="skel-line" width="50%" /><Skeleton className="skel-line skel-line--lg" width="70%" /></div>) : (
          <>
            <StatCard label="Orders today" value={s.orders_today} delta={`${s.active_orders} active · ${s.total_orders} all time`} />
            <StatCard label="Revenue" value={money(s.net_revenue)} delta={`${money(s.gross_revenue)} gross · ${money(s.refunded_amount)} refunded`} />
            <StatCard label="Avg rating" value={s.rating_count ? `★ ${s.rating_avg.toFixed(1)}` : "—"} delta={plural(s.rating_count, "review")} />
            <StatCard label="Pending returns" value={s.pending_returns} delta={<Link to="/owner/returns">Review requests →</Link>} />
          </>
        )}
      </div>

      {reminders.data?.items.length > 0 && (
        <section className="card card--tint-warning reminders" aria-labelledby="rem-title">
          <div className="row-between">
            <h2 id="rem-title" className="row-nowrap reminders__title"><Icon name="bell" /> Reminders <span className="badge badge--warning">{reminders.data.total}</span></h2>
            <span className="text-xs reminders__hint">Orders waiting over 15 min to be accepted or started</span>
          </div>
          <ul className="reminders__list">
            {reminders.data.items.map((r) => (
              <li key={r.id} className="reminder">
                <Icon name="clock" />
                <span className="grow">
                  <span className="strong">Order #{r.order_id} waiting {waitLabel(r.minutes_pending + minutesSince(r.created_at))}</span>
                  <span className="text-xs reminder__sub">{STATUS_META[r.order_status].label} · flagged {timeAgo(r.created_at)}</span>
                </span>
                <Button to={`/orders/${r.order_id}`} size="sm" variant="secondary">View</Button>
                <Button size="sm" variant="ghost" onClick={() => dismiss(r.id)} aria-label={`Dismiss reminder for order ${r.order_id}`}>Dismiss</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>Recent orders</h2><Link to="/owner/orders" className="text-sm">All orders →</Link></div>
        <Card>
          {recent.error ? <ErrorState message={recent.error} onRetry={recent.reload} />
            : !recent.data ? <div className="card__body"><ListSkeleton count={3} Item={() => <Skeleton className="skel-line skel-line--lg" />} /></div>
            : !recent.data.items.length ? <EmptyState icon="receipt" title="No orders yet">New orders appear here as soon as customers place them.</EmptyState>
            : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th className="num">Total</th><th>Status</th><th>Placed</th></tr></thead>
                  <tbody>
                    {recent.data.items.map((o) => (
                      <tr key={o.id}>
                        <td><Link to={`/orders/${o.id}`} className="strong">#{o.id}</Link></td>
                        <td className="nowrap">{o.customer.name}</td>
                        <td className="muted cell-clip">{itemSummary(o.items_preview)}</td>
                        <td className="num">{money(o.total_amount)}</td>
                        <td><StatusBadge status={o.status} /></td>
                        <td className="muted nowrap">{timeAgo(o.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      </section>

      {s && (
        <div className="split section">
          <Card>
            <CardHead title="Revenue · last 7 days"><span className="text-xs muted">Excludes cancelled and refunded</span></CardHead>
            <div className="card__body"><RevenueChart data={s.revenue_last_7_days} /></div>
          </Card>
          <Card>
            <CardHead title="Top dishes"><span className="text-xs muted">{s.menu_items_available}/{s.menu_items_total} available</span></CardHead>
            <div className="card__body">
              {!s.top_items.length ? <p className="muted text-sm">No sales yet.</p> : (
                <table className="table table--compact">
                  <thead><tr><th>Dish</th><th className="num">Sold</th><th className="num">Revenue</th></tr></thead>
                  <tbody>{s.top_items.map((t) => <tr key={t.name}><td>{t.name}</td><td className="num">{t.quantity}</td><td className="num">{money(t.revenue)}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          </Card>
          <Card className="span-2">
            <CardHead title="Orders by status" />
            <div className="card__body statusbars">
              {Object.entries(s.orders_by_status).map(([k, v]) => {
                const max = Math.max(1, ...Object.values(s.orders_by_status));
                return (
                  <div key={k} className="statusbar">
                    <span className="text-sm muted">{STATUS_META[k].label}</span>
                    <span className="statusbar__track"><span className="statusbar__fill" style={{ width: `${(v / max) * 100}%` }} /></span>
                    <span className="num strong">{v}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
