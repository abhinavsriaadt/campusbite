import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../api/client";
import { ordersApi } from "../../api/endpoints";
import { Alert, Button, Card, CardHead, EmptyState, Field, Icon, QtyStepper, Skeleton, VegMark } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { PAYMENT_METHODS } from "../../utils/constants";
import { money } from "../../utils/format";

export default function Cart() {
  const { user } = useAuth();
  const cart = useCart();
  const [address, setAddress] = useState(user?.address || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState("upi");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(null);
  const [quote, setQuote] = useState({ data: null, error: null, loading: false });

  // Ask the server to price the basket whenever it changes (authoritative totals + availability check).
  const basketKey = cart.items.map((i) => `${i.id}:${i.quantity}`).join(",");
  useEffect(() => {
    if (!cart.restaurant || !cart.items.length) return undefined;
    let alive = true;
    setQuote((q) => ({ ...q, loading: true }));
    const t = setTimeout(() => {
      ordersApi
        .quote({ restaurant_id: cart.restaurant.id, items: cart.items.map((i) => ({ menu_item_id: i.id, quantity: i.quantity })) })
        .then((data) => alive && setQuote({ data, error: null, loading: false }))
        .catch((err) => alive && setQuote({ data: null, error: errorMessage(err), loading: false }));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.restaurant?.id, basketKey]);

  if (placed) return <OrderPlaced order={placed} />;
  if (!cart.count) {
    return (
      <EmptyState icon="cart" title="Your cart is empty" action={<Button to="/" variant="primary">Browse restaurants</Button>}>
        Add dishes from a restaurant to get started.
      </EmptyState>
    );
  }

  const q = quote.data;

  async function placeOrder() {
    const v = {};
    if (address.trim().length < 5) v.address = "Enter your full delivery address (at least 5 characters)";
    if (phone.trim() && !/^[0-9+\-\s()]{7,20}$/.test(phone.trim())) v.phone = "Enter a valid phone number";
    setErrors(v);
    if (Object.keys(v).length) return;
    setError(null);
    setBusy(true);
    try {
      const order = await ordersApi.place({
        restaurant_id: cart.restaurant.id,
        items: cart.items.map((i) => ({ menu_item_id: i.id, quantity: i.quantity })),
        delivery_address: address.trim(),
        contact_phone: phone.trim() || null,
        notes: notes.trim() || null,
        payment_method: method,
      });
      setPlaced(order);
      cart.clear();
    } catch (err) {
      setError(errorMessage(err, "Could not place your order"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow stack checkout">
      <div className="page-head">
        <div><h1>Checkout</h1><p>Ordering from <Link to={`/restaurants/${cart.restaurant.id}`}>{cart.restaurant.name}</Link></p></div>
      </div>

      <Card>
        <CardHead title="Items"><Button variant="ghost" size="sm" onClick={cart.clear}>Clear cart</Button></CardHead>
        <ul className="card__body cartlines">
          {cart.items.map((i) => (
            <li key={i.id} className="cartline">
              <VegMark veg={i.is_veg} />
              <span className="grow cartline__name">{i.name}</span>
              <QtyStepper outline value={i.quantity} name={i.name} onChange={(n) => cart.setQuantity(i.id, n)} />
              <span className="price cartline__price">{money(i.price * i.quantity)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card aria-live="polite">
        <CardHead title="Bill summary">{quote.loading && q && <span className="text-xs muted">Updating…</span>}</CardHead>
        <div className="card__body">
          {quote.error ? <Alert>{quote.error}</Alert>
            : !q ? <div className="stack-sm" aria-label="Calculating your bill">{[60, 50, 40, 70].map((w) => <Skeleton key={w} className="skel-line" width={`${w}%`} />)}</div>
            : (
              <div className={quote.loading ? "is-refreshing" : ""}>
                <div className="kv"><span>Item total</span><span>{money(q.subtotal)}</span></div>
                <div className="kv"><span>Delivery fee</span><span>{Number(q.delivery_fee) === 0 ? <b className="free">Free on campus</b> : money(q.delivery_fee)}</span></div>
                <div className="kv"><span>Taxes</span><span>{money(q.tax)}</span></div>
                <div className="kv kv--total"><span>To pay</span><span>{money(q.total)}</span></div>
              </div>
            )}
        </div>
      </Card>

      <Card>
        <CardHead title="Delivery details" />
        <div className="card__body form-grid">
          <Field label="Delivery address" className="full" error={errors.address}>
            <textarea className="textarea" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} autoComplete="street-address" />
          </Field>
          <Field label="Contact phone" error={errors.phone}><input className="input" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Note for the restaurant"><input className="input" value={notes} maxLength={500} placeholder="e.g. Less spicy" onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      </Card>

      <Card>
        <CardHead title="Payment"><span className="badge badge--info">Demo mode</span></CardHead>
        <div className="card__body stack-sm">
          <p className="text-sm muted">CampusBite uses a dummy payment system. No real money moves and no card details are collected.</p>
          <div className="paymethods" role="radiogroup" aria-label="Payment method">
            {PAYMENT_METHODS.map((m) => (
              <label key={m.value} className={`pick pick--center${method === m.value ? " pick--on" : ""}`}>
                <input type="radio" name="method" value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} />
                <Icon name={m.icon} /><span>{m.label}</span>
              </label>
            ))}
          </div>
        </div>
      </Card>

      <Alert>{error}</Alert>
      <Button variant="primary" size="lg" block loading={busy} disabled={!q || quote.loading || !!quote.error} onClick={placeOrder}>
        {q ? `Pay ${money(q.total)} (mock)` : "Calculating total…"}
      </Button>
    </div>
  );
}

function OrderPlaced({ order }) {
  return (
    <div className="narrow placed" role="status">
      <span className="placed__check" aria-hidden>
        <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-15" /></svg>
      </span>
      <h1>Order placed!</h1>
      <p className="muted">Order #{order.id} from {order.restaurant.name}. Your demo payment of <b className="price">{money(order.total_amount)}</b> was captured.</p>
      <div className="row placed__actions">
        <Button to={`/orders/${order.id}`} variant="primary" size="lg" iconRight="arrowRight">Track order</Button>
        <Button to="/" variant="ghost" size="lg">Back to restaurants</Button>
      </div>
    </div>
  );
}
