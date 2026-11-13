import { useEffect, useState } from "react";
import { errorMessage } from "../../api/client";
import { ownerApi } from "../../api/endpoints";
import { Alert, Button, Card, CardHead, ErrorState, Field, FoodImage, ListSkeleton, RowSkeleton, Switch } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { useAsync } from "../../hooks/useAsync";

const FIELDS = ["name", "cuisine", "phone", "address", "description", "image_url"];

export default function RestaurantSettings() {
  const toast = useToast();
  const r = useAsync(() => ownerApi.restaurant(), []);
  const [f, setF] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (r.data) setF(Object.fromEntries([...FIELDS.map((k) => [k, r.data[k] || ""]), ["is_open", r.data.is_open]]));
  }, [r.data]);

  if (r.error) return <ErrorState message={r.error} onRetry={r.reload} />;
  if (!f) return <ListSkeleton count={2} Item={RowSkeleton} />;

  async function save(e) {
    e.preventDefault();
    const v = {};
    if (f.name.trim().length < 2) v.name = "Restaurant name must be at least 2 characters";
    if (f.image_url.trim() && !/^https?:\/\//i.test(f.image_url.trim())) v.image_url = "Use a link that starts with https://";
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    setError(null);
    try {
      const body = Object.fromEntries(FIELDS.map((k) => [k, f[k].trim() || (k === "name" ? f.name : null)]));
      body.is_open = f.is_open;
      r.setData(await ownerApi.updateRestaurant(body));
      toast.success("Restaurant updated");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const input = (k, props = {}) => <input className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} />;

  return (
    <div className="narrow">
      <div className="page-head"><div><h1>Restaurant profile</h1><p>This is what customers see when they browse CampusBite.</p></div></div>
      <Card as="form" onSubmit={save} noValidate>
        <FoodImage src={f.image_url} alt="" className="settings__img" />
        <CardHead title={f.name || "Your restaurant"}>
          <label className="row-nowrap text-sm strong">
            <Switch checked={f.is_open} onChange={(v) => setF({ ...f, is_open: v })} label="Accepting orders" />
            {f.is_open ? "Accepting orders" : "Closed"}
          </label>
        </CardHead>
        <div className="card__body form-grid">
          <div className="full"><Alert>{error}</Alert></div>
          <Field label="Name" error={errors.name}>{input("name", { maxLength: 150 })}</Field>
          <Field label="Cuisine">{input("cuisine", { maxLength: 100 })}</Field>
          <Field label="Phone">{input("phone", { type: "tel", maxLength: 20 })}</Field>
          <Field label="Image URL" error={errors.image_url}>{input("image_url", { type: "url", maxLength: 500, placeholder: "https://…" })}</Field>
          <Field label="Address" className="full">{input("address", { maxLength: 500 })}</Field>
          <Field label="Description" className="full">
            <textarea className="textarea" value={f.description} maxLength={2000} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
        </div>
        <div className="modal__foot"><Button type="submit" variant="primary" loading={busy}>Save changes</Button></div>
      </Card>
    </div>
  );
}
