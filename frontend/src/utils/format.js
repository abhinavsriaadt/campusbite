const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const inrShort = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export const money = (v) => inr.format(Number(v || 0));
export const moneyShort = (v) => inrShort.format(Number(v || 0));

export function dateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function dateOnly(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? "s" : ""} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d > 1 ? "s" : ""} ago`;
  return dateOnly(iso);
}

/** plural(1, "item") → "1 item"; plural(2, "delivery", "deliveries") → "2 deliveries" */
export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export const minutesSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

/** Local calendar-day key (YYYY-MM-DD in the viewer's timezone). */
function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Today", "Yesterday" or "12 Nov" (with the year when it isn't this year). */
function dayHeading(iso) {
  const key = dayKey(iso);
  const now = new Date();
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return "Yesterday";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() && { year: "numeric" }) });
}

/** Group items (already sorted) into [{ key, heading, items }] by local day of `field`. */
export function groupByDay(items, field = "created_at") {
  const groups = [];
  for (const item of items) {
    const key = dayKey(item[field]);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, heading: dayHeading(item[field]), items: [item] });
  }
  return groups;
}

/** "Paneer Tikka ×2, Naan ×3" */
export const itemSummary = (preview = []) => preview.map((i) => `${i.name} ×${i.quantity}`).join(", ");

/** 23 → "23 min", 95 → "1 hr 35 min", 1631 → "1 day 3 hr". */
export function waitLabel(minutes) {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${m % 60 ? ` ${m % 60} min` : ""}`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? "s" : ""}${h % 24 ? ` ${h % 24} hr` : ""}`;
}
