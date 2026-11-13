import { useState } from "react";
import { errorMessage } from "../api/client";
import { Alert, Avatar, Button, Card, CardHead, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ROLE_LABEL } from "../utils/constants";
import { dateOnly } from "../utils/format";

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ name: user.name, phone: user.phone || "", address: user.address || "" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    const v = {};
    if (f.name.trim().length < 2) v.name = "Enter your full name";
    if (f.phone.trim() && !/^[0-9+\-\s()]{7,20}$/.test(f.phone.trim())) v.phone = "Enter a valid phone number";
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    setError(null);
    try {
      await updateProfile({ name: f.name.trim(), phone: f.phone.trim() || null, address: f.address.trim() || null });
      toast.success("Profile updated");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow stack">
      <Card className="card--pad row profile__head">
        <Avatar name={user.name} large />
        <div className="grow"><h1 className="profile__name">{user.name}</h1><p className="muted text-sm">{user.email} · {ROLE_LABEL[user.role]} · joined {dateOnly(user.created_at)}</p></div>
      </Card>
      <Card as="form" onSubmit={save} noValidate>
        <CardHead title="Profile details" />
        <div className="card__body form-grid">
          <div className="full"><Alert>{error}</Alert></div>
          <Field label="Full name" className="full" error={errors.name}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>
          <Field label="Phone" className="full" error={errors.phone}><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></Field>
          {user.role === "customer" && (
            <Field label="Default delivery address" className="full">
              <textarea className="textarea" value={f.address} maxLength={500} onChange={(e) => setF({ ...f, address: e.target.value })} />
            </Field>
          )}
        </div>
        <div className="modal__foot"><Button type="submit" variant="primary" loading={busy}>Save changes</Button></div>
      </Card>
    </div>
  );
}
