import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { errorMessage } from "../../api/client";
import { Alert, Button, Field, Icon } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { ROLE_HOME } from "../../utils/constants";
import AuthLayout from "./AuthLayout";

const ROLE_OPTIONS = [
  { value: "customer", label: "Customer", sub: "Order food", icon: "utensils" },
  { value: "restaurant_owner", label: "Restaurant owner", sub: "Sell on CampusBite", icon: "store" },
  { value: "delivery_partner", label: "Delivery partner", sub: "Deliver orders", icon: "bike" },
];

function validate(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = "Enter your full name";
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = "Enter a valid email address";
  if (f.password.length < 8) e.password = "Use at least 8 characters";
  else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = "Use letters and at least one number";
  if (f.confirm !== f.password) e.confirm = "Passwords don't match";
  if (f.phone && !/^[0-9+\-\s()]{7,20}$/.test(f.phone)) e.phone = "Enter a valid phone number";
  if (f.role === "restaurant_owner" && f.restaurantName.trim().length < 2) e.restaurantName = "Restaurant name is required";
  return e;
}

export default function Register() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({
    role: "customer", name: "", email: "", password: "", confirm: "", phone: "", address: "",
    restaurantName: "", cuisine: "", restaurantAddress: "", description: "",
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const v = validate(f);
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: f.name.trim(), email: f.email.trim(), password: f.password, role: f.role,
        phone: f.phone.trim() || null, address: f.address.trim() || null,
      };
      if (f.role === "restaurant_owner") {
        payload.restaurant = {
          name: f.restaurantName.trim(), cuisine: f.cuisine.trim() || null,
          address: f.restaurantAddress.trim() || null, description: f.description.trim() || null, phone: f.phone.trim() || null,
        };
      }
      const u = await register(payload);
      navigate(ROLE_HOME[u.role], { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Registration failed"));
    } finally {
      setBusy(false);
    }
  }

  const input = (k, props = {}) => <input className="input" value={f[k]} onChange={set(k)} {...props} />;

  return (
    <AuthLayout>
      <h1 className="auth__title">Create your account</h1>
      <p className="muted">Join CampusBite in under a minute.</p>
      <form className="stack auth__form" onSubmit={submit} noValidate>
        <Alert>{error}</Alert>
        <fieldset className="rolecards">
          <legend className="field__label">I want to join as</legend>
          {ROLE_OPTIONS.map((r) => (
            <label key={r.value} className={`rolecard${f.role === r.value ? " rolecard--on" : ""}`}>
              <input type="radio" name="role" value={r.value} checked={f.role === r.value} onChange={() => setF({ ...f, role: r.value })} />
              <Icon name={r.icon} />
              <span className="rolecard__label">{r.label}</span>
              <span className="rolecard__sub">{r.sub}</span>
            </label>
          ))}
        </fieldset>
        <div className="form-grid">
          <Field label="Full name" error={errors.name} className="full">{input("name", { autoComplete: "name" })}</Field>
          <Field label="Email" error={errors.email} className="full">{input("email", { type: "email", autoComplete: "email" })}</Field>
          <Field label="Password" error={errors.password} hint="8+ characters with a number">{input("password", { type: "password", autoComplete: "new-password" })}</Field>
          <Field label="Confirm password" error={errors.confirm}>{input("confirm", { type: "password", autoComplete: "new-password" })}</Field>
          <Field label="Phone" error={errors.phone} className="full" hint={f.role === "delivery_partner" ? "Restaurants see this when assigning orders" : undefined}>
            {input("phone", { type: "tel", autoComplete: "tel", placeholder: "98765 43210" })}
          </Field>
          {f.role === "customer" && (
            <Field label="Delivery address" className="full" hint="You can change this at checkout">
              <textarea className="textarea" value={f.address} onChange={set("address")} maxLength={500} />
            </Field>
          )}
          {f.role === "restaurant_owner" && (
            <>
              <Field label="Restaurant name" error={errors.restaurantName}>{input("restaurantName", { maxLength: 150 })}</Field>
              <Field label="Cuisine">{input("cuisine", { placeholder: "e.g. North Indian", maxLength: 100 })}</Field>
              <Field label="Restaurant address" className="full">{input("restaurantAddress", { maxLength: 500 })}</Field>
              <Field label="Short description" className="full">
                <textarea className="textarea" value={f.description} onChange={set("description")} maxLength={2000} />
              </Field>
            </>
          )}
        </div>
        <Button type="submit" variant="primary" size="lg" block loading={busy}>Create account</Button>
      </form>
      <p className="text-sm muted center">Already have an account? <Link to="/login">Log in</Link></p>
    </AuthLayout>
  );
}
