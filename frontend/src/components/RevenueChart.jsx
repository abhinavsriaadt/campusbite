import { useState } from "react";
import { money, moneyShort } from "../utils/format";

/**
 * Single-series column chart (daily revenue, last 7 days). Plain SVG.
 * Single series → no legend (the card title names it). Hover/focus shows a tooltip;
 * a visually-hidden table provides the same data to screen readers.
 */
export default function RevenueChart({ data }) {
  const [hover, setHover] = useState(null);
  const W = 560, H = 220, PAD_L = 44, PAD_B = 28, PAD_T = 18;
  const innerW = W - PAD_L - 8;
  const innerH = H - PAD_B - PAD_T;
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const niceMax = niceCeil(max);
  const band = innerW / data.length;
  const barW = Math.min(24, band * 0.5);
  const y = (v) => PAD_T + innerH - (v / niceMax) * innerH;
  const ticks = [0, niceMax / 2, niceMax];
  const dayLabel = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" });
  const fullLabel = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });

  return (
    <div className={`chart${hover !== null ? " hovering" : ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily revenue for the last 7 days">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={PAD_L} x2={W - 8} y1={y(t)} y2={y(t)} />
            <text className="axis-text" x={PAD_L - 8} y={y(t) + 4} textAnchor="end">{moneyShort(t).replace("₹", "₹")}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = PAD_L + band * i + band / 2;
          const top = y(d.revenue);
          const h = Math.max(0, PAD_T + innerH - top);
          const r = Math.min(4, h);
          const x = cx - barW / 2;
          const base = PAD_T + innerH;
          // 4px rounded data-end, square at the baseline.
          const path = h > 0
            ? `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`
            : "";
          const isLast = i === data.length - 1;
          return (
            <g key={d.date}>
              {path && <path className={`bar${hover === i ? " on" : ""}`} d={path} />}
              {(isLast || hover === i) && d.revenue > 0 && (
                <text className="value-text" x={cx} y={top - 6} textAnchor="middle">{moneyShort(d.revenue)}</text>
              )}
              <text className="axis-text" x={cx} y={H - 8} textAnchor="middle">{isLast ? "Today" : dayLabel(d.date)}</text>
              <rect className="bar-hit" x={PAD_L + band * i} y={PAD_T} width={band} height={innerH} tabIndex={0}
                aria-label={`${fullLabel(d.date)}: ${money(d.revenue)}, ${d.orders} orders`}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{
          left: `${((PAD_L + band * hover + band / 2) / W) * 100}%`,
          top: `${(Math.max(PAD_T, y(data[hover].revenue) - 14) / H) * 100}%`,
        }}>
          <span>{fullLabel(data[hover].date)}</span>
          <b>{money(data[hover].revenue)}</b>
          <span>{data[hover].orders} order{data[hover].orders === 1 ? "" : "s"}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>Daily revenue, last 7 days</caption>
        <thead><tr><th>Date</th><th>Orders</th><th>Revenue</th></tr></thead>
        <tbody>
          {data.map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.orders}</td><td>{money(d.revenue)}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

function niceCeil(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}
