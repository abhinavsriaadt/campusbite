import { Link } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { money, moneyShort, plural } from "../../utils/format";
import Icon from "./Icon";
import { FoodImage, RatingChip, VegMark } from "./Misc";

/** Primary category first, then the rest, at most `max`. */
function topCategories(r, max = 2) {
  const cats = r.categories || [];
  const primary = r.primary_category?.slug;
  return [...cats].sort((a, b) => (b.slug === primary) - (a.slug === primary)).slice(0, max);
}

/**
 * 16:10 image with a bottom scrim · name · cuisine · rating · cost for two · open/closed ·
 * up to 2 category tags (DESIGN.md §3). `search` is appended to the link, e.g. "?tag=rolls".
 */
export function RestaurantCard({ r, search = "" }) {
  const cats = topCategories(r);
  const forTwo = r.cost_for_two != null ? `${moneyShort(r.cost_for_two)} for two` : null;
  return (
    <Link to={`/restaurants/${r.id}${search}`} className={`card card--interactive rcard${r.is_open ? "" : " rcard--closed"}`}
      aria-label={[r.name, r.cuisine || "restaurant", forTwo, r.is_open ? null : "currently closed"].filter(Boolean).join(", ")}>
      <FoodImage src={r.image_url} alt="" />
      <div className="rcard__body">
        <span className="rcard__name truncate">{r.name}</span>
        <span className="text-sm muted truncate">{r.cuisine || "Multi-cuisine"}</span>
        <span className="rcard__meta">
          <RatingChip value={r.rating_avg} count={r.rating_count} />
          {r.rating_count > 0 && <span>{plural(r.rating_count, "rating")}</span>}
          {forTwo && <><span aria-hidden>·</span><span className="num">{forTwo}</span></>}
          <span aria-hidden>·</span>
          <span className={`open-dot${r.is_open ? "" : " open-dot--closed"}`}>{r.is_open ? "Open" : "Closed"}</span>
        </span>
        {cats.length > 0 && (
          <span className="rcard__tags">{cats.map((c) => <span key={c.slug} className="tag">{c.name}</span>)}</span>
        )}
      </div>
    </Link>
  );
}

/** `– 1 +` quantity stepper. */
export function QtyStepper({ value, onChange, name, outline }) {
  return (
    <div className={`stepper-qty${outline ? " stepper-qty--outline" : ""}`}>
      <button type="button" onClick={() => onChange(value - 1)} aria-label={`Remove one ${name}`}><Icon name="minus" /></button>
      <span aria-live="polite" aria-label={`${value} in cart`}>{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= 50} aria-label={`Add one ${name}`}><Icon name="plus" /></button>
    </div>
  );
}

/**
 * Menu row: text left, 96px image right, ADD overlapping the image bottom → stepper once in the cart.
 * `onAdd` is called for the first add (it may show a login or cart-conflict prompt); later +/- go to the cart.
 */
export function DishCard({ dish, qty = 0, canOrder, onAdd, onQty, highlight }) {
  return (
    <article className={`dish${dish.is_available ? "" : " dish--unavailable"}${highlight ? " dish--match" : ""}`}
      data-dish-id={dish.id}>
      <div className="dish__text">
        <VegMark veg={dish.is_veg} />
        <h4 className="dish__name">{dish.name}</h4>
        <span className="dish__price">{money(dish.price)}</span>
        {dish.description && <p className="dish__desc clamp-2">{dish.description}</p>}
        {!dish.is_available && <span className="text-xs strong muted">Currently unavailable</span>}
      </div>
      <div className="dish__media">
        <FoodImage src={dish.image_url} alt={dish.name} square />
        {canOrder && dish.is_available && (
          <div className="dish__add">
            {qty > 0
              ? <QtyStepper value={qty} name={dish.name} onChange={onQty} />
              : <button type="button" className="add-btn" onClick={onAdd} aria-label={`Add ${dish.name} to cart`}>ADD</button>}
          </div>
        )}
      </div>
    </article>
  );
}

/** Fixed bottom bar while the cart has items: "2 items · ₹480 | View cart →" (DESIGN.md §3). */
export function StickyCartBar() {
  const cart = useCart();
  if (!cart.count) return null;
  return (
    <Link to="/cart" className="cartbar" aria-label={`View cart: ${plural(cart.count, "item")}, ${money(cart.subtotal)}`}>
      <span className="num">{plural(cart.count, "item")} · {money(cart.subtotal)}</span>
      <span className="cartbar__cta">View cart <Icon name="arrowRight" /></span>
    </Link>
  );
}
