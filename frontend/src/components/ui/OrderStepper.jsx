import { dateTime } from "../../utils/format";
import { STEPPER } from "../../utils/status";
import Icon from "./Icon";

/**
 * Placed → Accepted → Preparing → Ready → On the way → Delivered (DESIGN.md §3).
 * Horizontal on desktop, vertical on mobile. Times come from the order's real status history.
 */
export default function OrderStepper({ order }) {
  const reachedAt = {};
  (order.status_history || []).forEach((h) => {
    const step = STEPPER.find((s) => s.reached.includes(h.to_status));
    if (step) reachedAt[step.key] ??= h.created_at;
  });
  const current = STEPPER.findIndex((s) => s.reached.includes(order.status));
  return (
    <ol className="ostep" aria-label="Order progress">
      {STEPPER.map((s, i) => {
        const done = i < current || (i === current && s.key === "DELIVERED");
        const isCurrent = i === current && !done;
        return (
          <li key={s.key} className={`ostep__item${done ? " ostep__item--done" : ""}${isCurrent ? " ostep__item--current" : ""}`}
            aria-current={isCurrent ? "step" : undefined}>
            <span className="ostep__dot">{done && <Icon name="check" />}</span>
            <span className="ostep__label">{s.label}{done ? <span className="sr-only"> (done)</span> : isCurrent ? <span className="sr-only"> (current)</span> : null}</span>
            {reachedAt[s.key] && <span className="ostep__time">{dateTime(reachedAt[s.key])}</span>}
          </li>
        );
      })}
    </ol>
  );
}
