import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ordersApi } from "../api/endpoints";
import OrderActions from "../components/OrderActions";
import {
  Alert, Badge, Card, CardHead, ErrorState, Icon, ListSkeleton, OrderStepper, PaymentBadge, ReturnBadge, RowSkeleton, Stars, StatusBadge,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useAsync } from "../hooks/useAsync";
import { dateTime, money, plural, timeAgo } from "../utils/format";
import { STATUS_META } from "../utils/status";

const BACK = {
  customer: ["/orders", "My orders"],
  restaurant_owner: ["/owner/orders", "Orders"],
  delivery_partner: ["/delivery", "Deliveries"],
};
const FINISHED = ["DELIVERED", "CANCELLED", "REFUNDED"];

/** Order detail shared by all roles. The API decides what each role sees and can do. */
export default function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const order = useAsync(() => ordersApi.get(id), [id]);

  // Light polling while the order is in progress so the status stays current (no websockets needed).
  const live = order.data && !FINISHED.includes(order.data.status);
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => document.visibilityState === "visible" && ordersApi.get(id).then((o) => order.setData(o)).catch(() => {}), 20000);
    return () => clearInterval(t);
  }, [live, id, order.setData]);

  const [backTo, backLabel] = BACK[user.role];
  if (order.error) return <><Link to={backTo} className="back-link"><Icon name="arrowLeft" /> {backLabel}</Link><ErrorState message={order.error} onRetry={order.reload} /></>;
  if (!order.data) return <ListSkeleton count={3} Item={RowSkeleton} />;
  const o = order.data;
  const isPartner = user.role === "delivery_partner";

  return (
    <>
      <Link to={backTo} className="back-link"><Icon name="arrowLeft" /> {backLabel}</Link>
      <div className="page-head">
        <div>
          <div className="row"><h1>Order #{o.id}</h1><StatusBadge status={o.status} /></div>
          <p>{o.restaurant.name} · placed {dateTime(o.created_at)}{live ? ` · updated ${timeAgo(o.status_updated_at)}` : ""}</p>
        </div>
        <div className="row detail__actions"><OrderActions order={o} size="md" onUpdated={(u) => order.setData(u)} /></div>
      </div>

      <Card className="card--pad detail__progress">
        {o.status === "CANCELLED" ? (
          <Alert type="error">Order cancelled{o.cancel_reason ? `: ${o.cancel_reason}` : ""}.{o.payment_status === "refunded" && " The payment has been refunded."}</Alert>
        ) : (
          <>
            <OrderStepper order={o} />
            {o.status === "REFUNDED" && <Alert type="info" className="detail__note">Delivered, then refunded after an approved return request.</Alert>}
          </>
        )}
      </Card>

      <div className="split section-sm">
        <div className="stack">
          <Card>
            <CardHead title="Items"><span className="text-sm muted">{plural(o.item_count, "item")}</span></CardHead>
            <div className="card__body">
              {o.items.map((i) => (
                <div key={i.id} className="kv"><span>{i.quantity} × {i.item_name} <span className="muted text-xs">@ {money(i.unit_price)}</span></span><span>{money(i.line_total)}</span></div>
              ))}
              <hr className="divider" />
              <div className="kv"><span className="muted">Item total</span><span>{money(o.subtotal)}</span></div>
              <div className="kv"><span className="muted">Delivery fee</span><span>{Number(o.delivery_fee) === 0 ? "Free" : money(o.delivery_fee)}</span></div>
              <div className="kv"><span className="muted">Taxes</span><span>{money(o.tax)}</span></div>
              <div className="kv kv--total"><span>Total</span><span>{money(o.total_amount)}</span></div>
              {o.notes && <p className="text-sm detail__note"><b>Note:</b> {o.notes}</p>}
            </div>
          </Card>

          <Card>
            <CardHead title="Status history" />
            <ol className="card__body timeline">
              {[...o.status_history].reverse().map((h) => (
                <li key={h.id}>
                  <span className="strong">{STATUS_META[h.to_status]?.label}</span>
                  <span className="text-xs muted"> · {dateTime(h.created_at)}</span>
                  {h.note && <span className="text-sm muted block">{h.note}</span>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHead title="Delivery" />
            <div className="card__body stack-sm">
              {user.role !== "customer" && (
                <div><p className="eyebrow">Customer</p><p className="strong">{o.customer.name}</p>
                  {o.contact_phone && <a href={`tel:${o.contact_phone}`} className="tel"><Icon name="phone" /> {o.contact_phone}</a>}</div>
              )}
              <div><p className="eyebrow">Deliver to</p><p>{o.delivery_address}</p></div>
              {isPartner && (
                <div><p className="eyebrow">Pick up from</p><p className="strong">{o.restaurant.name}</p>
                  {o.restaurant.phone && <a href={`tel:${o.restaurant.phone}`} className="tel"><Icon name="phone" /> {o.restaurant.phone}</a>}</div>
              )}
              <div><p className="eyebrow">Delivery partner</p>
                {o.delivery_partner
                  ? <p className="row-nowrap"><Icon name="bike" /> {o.delivery_partner.name}{o.delivery_partner.phone && !isPartner ? ` · ${o.delivery_partner.phone}` : ""}</p>
                  : <p className="muted text-sm">Not assigned yet</p>}
              </div>
            </div>
          </Card>

          {!isPartner && (
            <Card>
              <CardHead title="Payment"><PaymentBadge status={o.payment_status} /></CardHead>
              <div className="card__body stack-sm">
                <p className="text-sm muted">Method: <b className="upper">{o.payment_method}</b> (demo, no real money moved)</p>
                {o.payments.map((p) => (
                  <div key={p.id} className="row-between text-sm">
                    <span className="row"><Badge tone={p.entry_type === "REFUND" ? "grey" : "success"}>{p.entry_type === "REFUND" ? "Refund" : "Payment"}</Badge><code className="text-xs muted">{p.transaction_ref}</code></span>
                    <span className="price strong">{p.entry_type === "REFUND" ? "−" : ""}{money(p.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {o.return_request && (
            <Card>
              <CardHead title="Refund request"><ReturnBadge status={o.return_request.status} /></CardHead>
              <div className="card__body stack-sm">
                <blockquote className="quote">“{o.return_request.reason}”</blockquote>
                <p className="text-xs muted">Requested {dateTime(o.return_request.created_at)}</p>
                {o.return_request.resolution_note && <p className="text-sm"><b>Restaurant:</b> {o.return_request.resolution_note}</p>}
              </div>
            </Card>
          )}

          {o.review && (
            <Card>
              <CardHead title="Review" />
              <div className="card__body stack-sm"><Stars value={o.review.rating} />{o.review.comment && <p>{o.review.comment}</p>}</div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
