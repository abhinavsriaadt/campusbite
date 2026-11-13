import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { errorMessage } from "../../api/client";
import { Alert, Button, Field } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { ROLE_HOME } from "../../utils/constants";
import AuthLayout from "./AuthLayout";

const DEMO = [
  ["Customer", "customer@campusbite.dev"],
  ["Restaurant owner", "owner@campusbite.dev"],
  ["Delivery partner", "rider@campusbite.dev"],
];
const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO_ACCOUNTS !== "false";

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  async function submit(e) {
    e.preventDefault();
    const v = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) v.email = "Enter the email you signed up with";
    if (!form.password) v.password = "Enter your password";
    setErrors(v);
    if (Object.keys(v).length) return;
    setError(null);
    setBusy(true);
    try {
      const u = await login(form.email.trim(), form.password);
      const raw = location.state?.from;
      // Same-origin relative paths only (blocks //evil.com and /\evil.com open redirects).
      const from = typeof raw === "string" && /^\/(?![/\\])/.test(raw) ? raw : null;
      // Only honour a redirect into an area the role can access.
      const target = from && (u.role === "customer" ? !from.startsWith("/owner") && !from.startsWith("/delivery") : from.startsWith(ROLE_HOME[u.role]))
        ? from
        : ROLE_HOME[u.role];
      navigate(target, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Login failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="auth__title">Welcome back</h1>
      <p className="muted">Log in to continue to CampusBite.</p>
      <form className="stack auth__form" onSubmit={submit} noValidate>
        <Alert>{error}</Alert>
        <Field label="Email" error={errors.email}>
          <input className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" error={errors.password}>
          <input className="input" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={busy}>Log in</Button>
      </form>
      <p className="text-sm muted center">New to CampusBite? <Link to="/register">Create an account</Link></p>
      {SHOW_DEMO && (
        <div className="demo">
          <p className="text-sm strong">Demo accounts · password <code>CampusBite@123</code></p>
          {DEMO.map(([label, email]) => (
            <button key={email} type="button" className="demo__row" onClick={() => setForm({ email, password: "CampusBite@123" })}>
              <span className="muted">{label}</span><span className="demo__email">{email}</span>
            </button>
          ))}
        </div>
      )}
    </AuthLayout>
  );
}
