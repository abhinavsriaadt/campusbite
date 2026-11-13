import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client";
import { catalogApi, ordersApi } from "../api/endpoints";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { itemSummary, money, timeAgo } from "../utils/format";
import OrderActions from "./OrderActions";
import { Button, ConfirmDialog, FoodImage, Icon, PaymentBadge, ReturnBadge, StatusBadge } from "./ui";

const REORDERABLE = ["DELIVERED", "CANCELLED", "REFUNDED"];

/**
 * Reorder: put a past order's dishes back in the cart using the restaurant's *current* menu
 * (unavailable dishes are skipped). The checkout re-quotes every price on the server.
 */
function useReorder(order) {
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);

  async function prepare() {
    setBusy(true);
    try {
      const [detail, menu] = await Promise.all([
        ordersApi.get(order.id),
        catalogApi.menu(order.restaurant.id, { available_only: true, page_size: 100 }),
      ]);
      const restaurant = await catalogApi.restaurant(order.restaurant.id);
      if (!restaurant.is_open) throw new Error(`${restaurant.name} isn't accepting orders right now.`);
      const byId = new Map(menu.items.map((m) => [m.id, m]));
      const lines = detail.items.filter((i) => byId.has(i.menu_item_id)).map((i) => ({ dish: byId.get(i.menu_item_id), quantity: i.quantity }));
      if (!lines.length) throw new Error("None of these dishes are available right now.");
      const skipped = detail.items.length - lines.length;
      const apply = () => {
        cart.replaceWith(restaurant, lines);
        toast.success(skipped ? `Added ${lines.length} dishes · ${skipped} no longer available` : "Added to your cart");
        navigate("/cart");
      };
      if (cart.count) setConfirm(() => apply);
      else apply();
    } catch (err) {
      toast.error(err.response ? errorMessage(err) : err.message);
    } finally {
      setBusy(false);
    }
  }

  const dialog = (
    <ConfirmDialog open={!!confirm} title="Replace your cart?" confirmLabel="Replace cart" onClose={() => setConfirm(null)}
      onConfirm={() => { confirm(); setConfirm(null); }}>
      <p>Your cart already has items from <b>{cart.restaurant?.name}</b>. Reordering replaces them.</p>
    </ConfirmDialog>
  );
  return { busy, prepare, dialog };
}

function ReorderButton({ order }) {
  const r = useReorder(order);
  return (
    <>
      <Button size="sm" variant="secondary" icon="rotate" loading={r.busy} onClick={r.prepare}>Reorder</Button>
      {r.dialog}
    </>
  );
}

/** Order row for customer and owner lists: thumbnail · who · items · total · chips · next actions. */
export default function OrderCard({ order, perspective = "customer", onUpdated }) {
  const title = perspective === "owner" ? order.customer.name : order.restaurant.name;
  const showReorder = perspective === "customer" && REORDERABLE.includes(order.status);
  return (
    <article className="card orow">
      <Link to={`/orders/${order.id}`} className="orow__main" aria-label={`Order #${order.id} from ${order.restaurant.name}, details`}>
        <FoodImage src={order.restaurant.image_url} square className="orow__thumb" />
        <div className="orow__text">
          <div className="row-between">
            <span className="strong truncate">{title}</span>
            <span className="price strong">{money(order.total_amount)}</span>
          </div>
          <span className="text-sm muted clamp-2">{itemSummary(order.items_preview)}</span>
          <span className="text-xs muted">Order #{order.id} · {timeAgo(order.created_at)}
            {perspective === "owner" && order.delivery_partner && <> · <Icon name="bike" className="inline-icon" /> {order.delivery_partner.name}</>}
          </span>
          <div className="row">
            <StatusBadge status={order.status} />
            <PaymentBadge status={order.payment_status} />
            <ReturnBadge status={order.return_status} />
          </div>
        </div>
      </Link>
      <div className="orow__actions">
        <OrderActions order={order} onUpdated={onUpdated} />
        {showReorder && <ReorderButton order={order} />}
      </div>
    </article>
  );
}
