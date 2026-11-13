import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";

/**
 * Client-side cart (single restaurant at a time). Prices shown here are for display only —
 * the backend recomputes every total from the database when the order is placed.
 */
const CartContext = createContext(null);
const EMPTY = { restaurant: null, items: [] };

const keyFor = (user) => `campusbite_cart_${user?.id ?? "guest"}`;

function load(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : EMPTY;
    return parsed && Array.isArray(parsed.items) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function CartProvider({ children }) {
  const { user } = useAuth();
  const storageKey = keyFor(user);
  const [cart, setCart] = useState(() => load(storageKey));
  // Increments on every add so the cart badge can bounce once (DESIGN.md §6).
  const [bump, setBump] = useState(0);

  // Switch carts when the logged-in user changes.
  useEffect(() => setCart(load(storageKey)), [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {
      /* storage unavailable — cart still works in memory */
    }
  }, [cart, storageKey]);

  /** Returns false if the item belongs to a different restaurant than the current cart. */
  const canAdd = useCallback((restaurantId) => !cart.restaurant || cart.restaurant.id === restaurantId, [cart]);

  const addItem = useCallback((restaurant, dish, { replace = false } = {}) => {
    setCart((c) => {
      const base = replace || !c.restaurant || c.restaurant.id !== restaurant.id ? { ...EMPTY } : c;
      const existing = base.items.find((i) => i.id === dish.id);
      const items = existing
        ? base.items.map((i) => (i.id === dish.id ? { ...i, quantity: Math.min(50, i.quantity + 1) } : i))
        : [...base.items, { id: dish.id, name: dish.name, price: Number(dish.price), is_veg: dish.is_veg, quantity: 1 }];
      return { restaurant: { id: restaurant.id, name: restaurant.name }, items };
    });
    setBump((n) => n + 1);
    setBump((n) => n + 1);
  }, []);

  /** Replace the cart with these lines (used by Reorder). Prices are display-only; the server re-quotes. */
  const replaceWith = useCallback((restaurant, lines) => {
    setCart({
      restaurant: { id: restaurant.id, name: restaurant.name },
      items: lines.map(({ dish, quantity }) => ({
        id: dish.id, name: dish.name, price: Number(dish.price), is_veg: dish.is_veg, quantity: Math.min(50, quantity),
      })),
    });
    setBump((n) => n + 1);
  }, []);

  const setQuantity = useCallback((dishId, quantity) => {
    setCart((c) => {
      const items =
        quantity <= 0
          ? c.items.filter((i) => i.id !== dishId)
          : c.items.map((i) => (i.id === dishId ? { ...i, quantity: Math.min(50, quantity) } : i));
      return items.length ? { ...c, items } : { ...EMPTY };
    });
  }, []);

  const removeItem = useCallback((dishId) => setQuantity(dishId, 0), [setQuantity]);
  const clear = useCallback(() => setCart({ ...EMPTY }), []);

  const value = useMemo(() => {
    const count = cart.items.reduce((n, i) => n + i.quantity, 0);
    const subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const qtyOf = (id) => cart.items.find((i) => i.id === id)?.quantity || 0;
    return { ...cart, count, subtotal, qtyOf, canAdd, addItem, replaceWith, setQuantity, removeItem, clear, bump };
  }, [cart, canAdd, addItem, replaceWith, setQuantity, removeItem, clear, bump]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
