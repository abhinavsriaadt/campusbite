import { STATUS_META } from "../../utils/status";
import { Chip } from "./Badge";
import Button from "./Button";
import Field from "./Field";

/**
 * Status chips (horizontally scrollable), a date range and a Clear button (DESIGN.md §3).
 * `value` = { status, date_from, date_to }. `statuses` limits which chips appear.
 * `status` is a single API status or a comma list; "" means all.
 */
export default function FilterBar({ value, onChange, statuses, statusOptions, showDates = true, label = "Filter by status" }) {
  const options = statusOptions || statuses.map((s) => ({ value: s, label: STATUS_META[s].label }));
  const set = (patch) => onChange({ ...value, ...patch });
  const dirty = value.status || value.date_from || value.date_to;
  return (
    <div className="filterbar">
      <div className="chips" role="group" aria-label={label}>
        <Chip active={!value.status} onClick={() => set({ status: "" })}>All</Chip>
        {options.map((o) => (
          <Chip key={o.value} active={value.status === o.value} onClick={() => set({ status: value.status === o.value ? "" : o.value })}>{o.label}</Chip>
        ))}
      </div>
      {showDates && (
        <div className="filterbar__dates">
          <Field label="From">
            <input type="date" className="input" value={value.date_from || ""} max={value.date_to || undefined} onChange={(e) => set({ date_from: e.target.value })} />
          </Field>
          <Field label="To">
            <input type="date" className="input" value={value.date_to || ""} min={value.date_from || undefined} onChange={(e) => set({ date_to: e.target.value })} />
          </Field>
          {dirty && <Button variant="ghost" icon="x" onClick={() => onChange({ ...value, status: "", date_from: "", date_to: "" })}>Clear</Button>}
        </div>
      )}
      {!showDates && dirty && (
        <div><Button variant="ghost" size="sm" icon="x" onClick={() => set({ status: "" })}>Clear</Button></div>
      )}
    </div>
  );
}
