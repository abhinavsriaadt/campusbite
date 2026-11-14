export const ROLES = {
  CUSTOMER: "customer",
  OWNER: "restaurant_owner",
  PARTNER: "delivery_partner",
};

export const ROLE_LABEL = {
  customer: "Customer",
  restaurant_owner: "Restaurant owner",
  delivery_partner: "Delivery partner",
};

export const ROLE_HOME = {
  customer: "/",
  restaurant_owner: "/owner",
  delivery_partner: "/delivery",
};

/** Where to land after logging in: `from` if it's a same-origin path the role may open, else the role's home. */
export function postLoginTarget(role, from) {
  // Same-origin relative paths only (blocks //evil.com and /\evil.com open redirects).
  const safe = typeof from === "string" && /^\/(?![/\\])/.test(from) ? from : null;
  const allowed = safe && (role === "customer" ? !safe.startsWith("/owner") && !safe.startsWith("/delivery") : safe.startsWith(ROLE_HOME[role]));
  return allowed ? safe : ROLE_HOME[role];
}

export const PAYMENT_METHODS = [
  { value: "upi", label: "UPI", icon: "phoneDevice" },
  { value: "card", label: "Card", icon: "card" },
  { value: "wallet", label: "Wallet", icon: "wallet" },
  { value: "cash", label: "Cash on delivery", icon: "cash" },
];
