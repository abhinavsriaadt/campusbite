/**
 * Single source of truth for how order / payment / return states look and read (DESIGN.md §2).
 * `tone` maps to a Badge variant: info | warning | brand | success | danger | grey.
 */
const LIFECYCLE = ["PLACED", "ACCEPTED", "PREPARING", "READY", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED"];
export const ALL_STATUSES = [...LIFECYCLE, "CANCELLED", "REFUNDED"];
export const ACTIVE_STATUSES = ["PLACED", "ACCEPTED", "PREPARING", "READY", "ASSIGNED", "OUT_FOR_DELIVERY"];

export const STATUS_META = {
  PLACED: { label: "Order placed", tone: "info" },
  ACCEPTED: { label: "Accepted", tone: "info" },
  PREPARING: { label: "Being prepared", tone: "warning" },
  READY: { label: "Ready for pickup", tone: "warning" },
  ASSIGNED: { label: "Rider assigned", tone: "brand" },
  OUT_FOR_DELIVERY: { label: "On the way", tone: "brand" },
  DELIVERED: { label: "Delivered", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "grey" },
  REFUNDED: { label: "Refunded", tone: "grey" },
};

export const PAYMENT_META = {
  pending: { label: "Payment pending", tone: "warning" },
  mock_paid: { label: "Paid", tone: "success" },
  refunded: { label: "Refunded", tone: "grey" },
};

export const RETURN_META = {
  pending: { label: "Refund requested", tone: "warning" },
  approved: { label: "Refund approved", tone: "success" },
  rejected: { label: "Refund rejected", tone: "danger" },
};

/** The customer-facing stepper (DESIGN.md §3): ASSIGNED folds into READY, OUT_FOR_DELIVERY reads "On the way". */
export const STEPPER = [
  { key: "PLACED", label: "Placed", reached: ["PLACED"] },
  { key: "ACCEPTED", label: "Accepted", reached: ["ACCEPTED"] },
  { key: "PREPARING", label: "Preparing", reached: ["PREPARING"] },
  { key: "READY", label: "Ready", reached: ["READY", "ASSIGNED"] },
  { key: "OUT_FOR_DELIVERY", label: "On the way", reached: ["OUT_FOR_DELIVERY"] },
  { key: "DELIVERED", label: "Delivered", reached: ["DELIVERED", "REFUNDED"] },
];

/**
 * Labels for the lifecycle actions the API returns in `allowed_actions`.
 * The backend decides *whether* an action is allowed; this only names it.
 */
export const ACTION_META = {
  ACCEPTED: { label: "Accept" },
  PREPARING: { label: "Start preparing" },
  READY: { label: "Mark ready" },
  OUT_FOR_DELIVERY: { label: "Picked up · Start delivery" },
  DELIVERED: { label: "Mark delivered", confirm: true },
};

/** Orders older than this in PLACED/ACCEPTED are flagged on the owner board (matches the backend reminder threshold). */
export const STALE_MINUTES = 15;
export const STALE_STATUSES = ["PLACED", "ACCEPTED"];
