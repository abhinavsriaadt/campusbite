import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { errorMessage } from "../../api/client";
import { Button, Icon, OtpInput } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { postLoginTarget, ROLE_HOME } from "../../utils/constants";
import AuthLayout from "./AuthLayout";

const LENGTH = 6;
const EMPTY = Array(LENGTH).fill("");
const SUCCESS_DELAY_MS = 600;

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const secondsLeft = (p) => (p ? Math.max(0, Math.ceil((p.sentAt + p.cooldown * 1000 - Date.now()) / 1000)) : 0);

/** Shared second step for sign-up ("signup") and log-in ("login") codes. */
export default function Verify() {
  const { pending, user, verifyCode, resendCode, cancelVerification } = useAuth();
  const navigate = useNavigate();
  const [digits, setDigits] = useState(EMPTY);
  const [phase, setPhase] = useState("idle"); // idle | submitting | success
  const [msg, setMsg] = useState(null); // { tone: "error" | "info", text }
  const [needsNewCode, setNeedsNewCode] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [resending, setResending] = useState(false);
  const [left, setLeft] = useState(() => secondsLeft(pending));
  const timer = useRef(null);
  // Set by "Change email": navigation runs as a transition, so skip the no-pending redirect
  // below (it would replace our prefilled state) while we leave.
  const leaving = useRef(false);
  // verifyCode clears `pending`; keep showing what we verified during the "Verified" pause.
  const shown = useRef(pending);
  if (pending) shown.current = pending;
  const view = shown.current;

  // Resend countdown, derived from sentAt so it survives a refresh.
  useEffect(() => {
    setLeft(secondsLeft(pending));
    const id = setInterval(() => setLeft(secondsLeft(pending)), 1000);
    return () => clearInterval(id);
  }, [pending]);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (phase !== "success") {
    if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;
    if (!pending) return leaving.current ? null : <Navigate to="/login" replace />;
  }

  const signup = view?.purpose === "signup";
  const redirect = view?.redirect;

  async function submit(code) {
    if (phase !== "idle" || code.length !== LENGTH) return;
    setPhase("submitting");
    setMsg(null);
    try {
      const u = await verifyCode(code);
      setPhase("success");
      timer.current = setTimeout(() => navigate(postLoginTarget(u.role, redirect), { replace: true }), SUCCESS_DELAY_MS);
    } catch (err) {
      const data = err.response?.data || {};
      const status = err.response?.status;
      let text;
      let dead = false;
      if (data.code === "invalid" && data.attempts_left > 0) {
        const n = data.attempts_left;
        text = `Incorrect code. ${n} ${n === 1 ? "attempt" : "attempts"} left.`;
      } else if (data.code === "invalid" || data.code === "locked") {
        text = "Too many attempts. Request a new one.";
        dead = true;
      } else if (data.code === "expired" || data.code === "none") {
        text = data.detail;
        dead = true;
      } else if (status === 429) {
        text = "Too many attempts. Try again in a few minutes.";
      } else {
        text = errorMessage(err, "Couldn't verify the code. Please try again.");
      }
      setMsg({ tone: "error", text });
      setNeedsNewCode(dead);
      setDigits(EMPTY);
      setShakeKey((k) => k + 1);
      setPhase("idle");
    }
  }

  async function resend() {
    setResending(true);
    try {
      const r = await resendCode();
      setNeedsNewCode(false);
      setDigits(EMPTY);
      setMsg(r.sent
        ? { tone: "info", text: "A new code is on its way. Earlier codes no longer work." }
        : { tone: "error", text: `Please wait ${fmt(r.retryAfter)} before requesting another code.` });
    } catch (err) {
      setMsg({ tone: "error", text: err.response?.status === 429 ? "Too many attempts. Try again in a few minutes." : errorMessage(err) });
    } finally {
      setResending(false);
    }
  }

  function changeEmail() {
    const back = pending.from === "register" ? "/register" : "/login";
    const state = { email: pending.email, draft: pending.draft };
    leaving.current = true;
    cancelVerification();
    navigate(back, { replace: true, state });
  }

  const busy = phase === "submitting";
  const complete = digits.every((d) => d);

  return (
    <AuthLayout>
      <div className="verify">
        <span className={`verify__icon${phase === "success" ? " verify__icon--done" : ""}`} aria-hidden>
          <Icon name={phase === "success" ? "check" : "mail"} />
        </span>
        <h1 className="auth__title">{signup ? "Verify your email" : "Enter your login code"}</h1>
        {view && (
          <p className="muted">We sent a 6-digit code to <strong className="verify__email">{view.masked}</strong>.</p>
        )}

        <form className="stack verify__form" noValidate onSubmit={(e) => { e.preventDefault(); submit(digits.join("")); }}>
          <OtpInput
            value={digits}
            onChange={(d) => { setDigits(d); if (msg?.tone === "error" && !needsNewCode) setMsg(null); }}
            onComplete={submit}
            disabled={busy || phase === "success"}
            invalid={msg?.tone === "error"}
            success={phase === "success"}
            shakeKey={shakeKey}
            describedBy="otp-msg"
          />
          <p id="otp-msg" className={`verify__msg${msg ? ` verify__msg--${msg.tone}` : ""}`} aria-live="polite">
            {phase === "success" ? "" : msg?.text}
          </p>
          {phase === "success" ? (
            <p className="verify__success" role="status"><Icon name="check" /> Verified</p>
          ) : (
            <Button type="submit" variant={needsNewCode ? "secondary" : "primary"} size="lg" block loading={busy} disabled={!complete}>
              {busy ? "Verifying…" : "Verify"}
            </Button>
          )}
        </form>

        {phase !== "success" && (
          <div className="verify__foot">
            <Button
              variant={needsNewCode ? "primary" : "ghost"}
              size={needsNewCode ? "lg" : undefined}
              block={needsNewCode}
              icon="refresh"
              onClick={resend}
              loading={resending}
              disabled={left > 0 || busy}
            >
              {left > 0 ? `Resend in ${fmt(left)}` : "Resend code"}
            </Button>
            <p className="text-sm muted">Didn't get it? Check your spam folder.</p>
            <button type="button" className="linkbtn" onClick={changeEmail}>Change email</button>
            {import.meta.env.DEV && <p className="text-xs muted">Dev: check backend logs for the code</p>}
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
