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

export const PAYMENT_METHODS = [
  { value: "upi", label: "UPI", icon: "phoneDevice" },
  { value: "card", label: "Card", icon: "card" },
  { value: "wallet", label: "Wallet", icon: "wallet" },
  { value: "cash", label: "Cash on delivery", icon: "cash" },
];

/** Customer price-range shortcuts on the menu page (DESIGN.md §4). Bounds are inclusive, as the API filters. */
export const PRICE_RANGES = [
  { key: "lt150", label: "Under ₹150", min: "", max: "149.99" },
  { key: "150to300", label: "₹150–300", min: "150", max: "300" },
  { key: "gt300", label: "₹300+", min: "300.01", max: "" },
];
