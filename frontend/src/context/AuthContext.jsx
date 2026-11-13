import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { TOKEN_KEY, USER_KEY } from "../api/client";
import { authApi } from "../api/endpoints";

const AuthContext = createContext(null);

/**
 * A code the user still has to enter: { email, masked, purpose: "signup" | "login", sentAt,
 * cooldown, from, draft?, redirect? }. Kept in sessionStorage so /verify survives a refresh
 * but not a closed tab. `sentAt + cooldown` is when the server will accept a resend.
 */
const PENDING_KEY = "cb_pending_verification";

function readPending() {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
    return p && p.email && (p.purpose === "signup" || p.purpose === "login") ? p : null;
  } catch {
    return null;
  }
}

function writePending(p) {
  try {
    if (p) sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch { /* storage blocked: the in-memory copy still works until a refresh */ }
}

/** The 403 "verification_required" reply to /auth/login is a challenge, not a failure. */
const challengeFrom = (err) => (err.response?.status === 403 && err.response.data?.status === "verification_required" ? err.response.data : null);

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw && localStorage.getItem(TOKEN_KEY) ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [ready, setReady] = useState(!localStorage.getItem(TOKEN_KEY));
  const [pending, setPendingState] = useState(readPending);

  const setPending = useCallback((p) => {
    writePending(p);
    setPendingState(p);
  }, []);

  const startVerification = useCallback(
    (email, challenge, extra = {}) =>
      setPending({
        email, masked: challenge.email, purpose: challenge.purpose,
        sentAt: Date.now(), cooldown: Number(challenge.resend_in) || 0, ...extra,
      }),
    [setPending],
  );

  const persist = useCallback((token, u) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  // Validate a stored token against the API on first load.
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    authApi
      .me()
      .then((u) => {
        localStorage.setItem(USER_KEY, JSON.stringify(u));
        setUser(u);
      })
      .catch((err) => {
        if (err.response?.status === 401) logout();
      })
      .finally(() => setReady(true));
  }, [logout]);

  // Any 401 from the API (expired token) logs the user out.
  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener("campusbite:unauthorized", onUnauthorized);
    return () => window.removeEventListener("campusbite:unauthorized", onUnauthorized);
  }, [logout]);

  /** Password step. Returns { status: "ok", user } when no code is needed, else the challenge status. */
  const login = useCallback(
    async (email, password, { redirect } = {}) => {
      let res;
      try {
        res = await authApi.login({ email, password });
      } catch (err) {
        res = challengeFrom(err);
        if (!res) throw err;
      }
      if (res.access_token) {
        persist(res.access_token, res.user);
        return { status: "ok", user: res.user };
      }
      startVerification(email, res, { from: "login", redirect });
      return { status: res.status, purpose: res.purpose };
    },
    [persist, startVerification],
  );

  /** Creates the account and starts signup verification. `draft` (no passwords) refills the form on "Change email". */
  const register = useCallback(
    async (payload, draft) => {
      const res = await authApi.register(payload);
      startVerification(payload.email, res, { from: "register", draft });
      return { status: res.status, purpose: res.purpose };
    },
    [startVerification],
  );

  /** Code step: the only place a token is stored. */
  const verifyCode = useCallback(
    async (code) => {
      if (!pending) throw new Error("No verification in progress");
      const call = pending.purpose === "signup" ? authApi.verifyEmail : authApi.verifyLogin;
      const res = await call({ email: pending.email, code });
      persist(res.access_token, res.user);
      setPending(null);
      return res.user;
    },
    [pending, persist, setPending],
  );

  /** Ask for a new code. Resolves with the new cooldown; on 429 the cooldown comes from retry_after. */
  const resendCode = useCallback(async () => {
    if (!pending) throw new Error("No verification in progress");
    try {
      const res = await authApi.resendOtp({ email: pending.email, purpose: pending.purpose });
      setPending({ ...pending, sentAt: Date.now(), cooldown: Number(res.resend_in) || 0 });
      return { sent: true };
    } catch (err) {
      const wait = Number(err.response?.data?.retry_after ?? err.response?.headers?.["retry-after"]);
      if (err.response?.status === 429 && wait > 0) {
        setPending({ ...pending, sentAt: Date.now(), cooldown: wait });
        return { sent: false, retryAfter: wait };
      }
      throw err;
    }
  }, [pending, setPending]);

  const cancelVerification = useCallback(() => setPending(null), [setPending]);

  const updateProfile = useCallback(async (body) => {
    const u = await authApi.updateMe(body);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    return u;
  }, []);

  const value = useMemo(
    () => ({
      user, ready, isAuthenticated: !!user, login, register, logout, updateProfile,
      pending, verifyCode, resendCode, cancelVerification,
    }),
    [user, ready, login, register, logout, updateProfile, pending, verifyCode, resendCode, cancelVerification],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
