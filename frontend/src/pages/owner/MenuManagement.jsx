import { useState } from "react";
import { errorMessage } from "../../api/client";
import { ownerApi } from "../../api/endpoints";
import {
  Alert, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, FoodImage, Icon, ListSkeleton, Modal, Pagination, RowSkeleton, Switch, Tabs, VegMark,
} from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { useDebounced } from "../../hooks/useAsync";
import { usePaged } from "../../hooks/usePaged";
import { money } from "../../utils/format";

const EMPTY = { name: "", description: "", price: "", category: "", is_veg: true, is_available: true, image_url: "" };

export default function MenuManagement() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [availability, setAvailability] = useState("all");
  const [sort, setSort] = useState("name");
  const dq = useDebounced(q.trim());
  const list = usePaged((page) => ownerApi.menuItems({ q: dq, availability, sort, page, page_size: 15 }), [dq, availability, sort]);
  const [editing, setEditing] = useState(null); // null | "new" | item
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  /** Optimistic availability toggle; rolls back with an error toast if the API fails (DESIGN.md §6). */
  async function toggle(item, value) {
    list.setItems((items) => items.map((i) => (i.id === item.id ? { ...i, is_available: value } : i)));
    try {
      const updated = await ownerApi.setAvailability(item.id, value);
      list.setItems((items) => items.map((i) => (i.id === item.id ? updated : i)));
    } catch (err) {
      list.setItems((items) => items.map((i) => (i.id === item.id ? { ...i, is_available: !value } : i)));
      toast.error(`Couldn't update ${item.name}: ${errorMessage(err)}`);
    }
  }

  async function remove() {
    setDeleteBusy(true);
    try {
      await ownerApi.deleteItem(deleting.id);
      toast.success(`${deleting.name} deleted`);
      setDeleting(null);
      list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Menu</h1><p>Add dishes, update prices and control what customers can order.</p></div>
        <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Add dish</Button>
      </div>
      <div className="toolbar">
        <div className="search grow">
          <Icon name="search" />
          <input className="input" type="search" placeholder="Search your dishes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search dishes" />
        </div>
        <Tabs label="Availability" value={availability} onChange={setAvailability}
          items={[{ value: "all", label: "All" }, { value: "available", label: "Available" }, { value: "unavailable", label: "Unavailable" }]} />
        <select className="select select--inline" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort dishes">
          <option value="name">Name</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="newest">Newest</option>
        </select>
      </div>

      {list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : !list.loaded ? <ListSkeleton count={4} Item={RowSkeleton} />
        : !list.items.length ? (
          <EmptyState icon="book" title={dq || availability !== "all" ? "No dishes match" : "Your menu is empty"}
            action={<Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Add a dish</Button>}>
            Customers can only order dishes listed here.
          </EmptyState>
        ) : (
          <Card className={list.loading ? "is-refreshing" : ""}>
            <ul className="menulist">
              {list.items.map((i) => (
                <li key={i.id} className={`menurow${i.is_available ? "" : " menurow--off"}`}>
                  <FoodImage src={i.image_url} alt="" square className="menurow__img" />
                  <div className="grow menurow__text">
                    <span className="row-nowrap"><VegMark veg={i.is_veg} /><span className="strong truncate">{i.name}</span></span>
                    <span className="text-sm muted">{i.category || "No category"} · <span className="price">{money(i.price)}</span></span>
                  </div>
                  <label className="menurow__toggle">
                    <span className="text-xs muted menurow__state">{i.is_available ? "Available" : "Unavailable"}</span>
                    <Switch checked={i.is_available} onChange={(v) => toggle(i, v)} label={`${i.name} available to order`} />
                  </label>
                  <div className="menurow__actions">
                    <Button variant="ghost" size="sm" iconOnly icon="edit" aria-label={`Edit ${i.name}`} onClick={() => setEditing(i)} />
                    <Button variant="ghost" size="sm" iconOnly icon="trash" aria-label={`Delete ${i.name}`} onClick={() => setDeleting(i)} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      <Pagination list={list} />

      {editing && (
        <DishForm item={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => { setEditing(null); toast.success(`${saved.name} ${isNew ? "added" : "updated"}`); list.reload(); }} />
      )}
      <ConfirmDialog open={!!deleting} title={`Delete ${deleting?.name}?`} confirmLabel="Delete dish" variant="danger" busy={deleteBusy}
        onClose={() => setDeleting(null)} onConfirm={remove}>
        <p>Past orders keep their record of this dish. To hide it for now, switch it to unavailable instead.</p>
      </ConfirmDialog>
    </>
  );
}

function validate(f) {
  const e = {};
  const price = Number(f.price);
  if (f.name.trim().length < 2) e.name = "Dish name must be at least 2 characters";
  if (f.price === "" || !(price > 0)) e.price = "Price must be more than ₹0";
  else if (price > 100000) e.price = "Price can't be more than ₹1,00,000";
  if (f.image_url.trim() && !/^https?:\/\//i.test(f.image_url.trim())) e.image_url = "Use a link that starts with https://";
  return e;
}

/** Add / edit form in a side drawer (bottom sheet on phones). */
function DishForm({ item, onClose, onSaved }) {
  const [f, setF] = useState(item
    ? { ...EMPTY, ...item, description: item.description || "", category: item.category || "", image_url: item.image_url || "", price: String(item.price) }
    : EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    const v = validate(f);
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    setError(null);
    const body = {
      name: f.name.trim(), description: f.description.trim() || null, price: Math.round(Number(f.price) * 100) / 100,
      category: f.category.trim() || null, is_veg: f.is_veg, is_available: f.is_available, image_url: f.image_url.trim() || null,
    };
    try {
      const saved = item ? await ownerApi.updateItem(item.id, body) : await ownerApi.createItem(body);
      onSaved(saved, !item);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal open variant="drawer" title={item ? `Edit ${item.name}` : "Add a dish"} onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" form="dish-form" loading={busy}>{item ? "Save changes" : "Add dish"}</Button>
      </>}>
      <form id="dish-form" className="stack" onSubmit={submit} noValidate>
        <Alert>{error}</Alert>
        <Field label="Dish name" error={errors.name}><input className="input" value={f.name} onChange={set("name")} maxLength={150} /></Field>
        <div className="form-grid">
          <Field label="Price (₹)" error={errors.price}><input className="input" type="number" min="1" step="0.01" inputMode="decimal" value={f.price} onChange={set("price")} /></Field>
          <Field label="Category" hint="e.g. Starters, Mains"><input className="input" value={f.category} onChange={set("category")} maxLength={80} /></Field>
        </div>
        <Field label="Description"><textarea className="textarea" value={f.description} onChange={set("description")} maxLength={1000} /></Field>
        <Field label="Image URL (optional)" error={errors.image_url} hint="Leave blank to show a placeholder">
          <input className="input" type="url" value={f.image_url} onChange={set("image_url")} placeholder="https://…" maxLength={500} />
        </Field>
        <div className="row">
          <label className="checkbox"><input type="checkbox" checked={f.is_veg} onChange={set("is_veg")} /> Vegetarian</label>
          <label className="checkbox"><input type="checkbox" checked={f.is_available} onChange={set("is_available")} /> Available to order</label>
        </div>
      </form>
    </Modal>
  );
}
