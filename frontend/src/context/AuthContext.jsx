import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { TOKEN_KEY, USER_KEY } from "../api/client";
import { authApi } from "../api/endpoints";

const AuthContext = createContext(null);

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

  /** Email + password → stores the JWT and user, returns the user (the page redirects by role). */
  const login = useCallback(
    async (email, password) => {
      const res = await authApi.login({ email, password });
      persist(res.access_token, res.user);
      return res.user;
    },
    [persist],
  );

  /** Creates the account; the response is a normal login, so the user is signed in at once. */
  const register = useCallback(
    async (payload) => {
      const res = await authApi.register(payload);
      persist(res.access_token, res.user);
      return res.user;
    },
    [persist],
  );

  const updateProfile = useCallback(async (body) => {
    const u = await authApi.updateMe(body);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    return u;
  }, []);

  const value = useMemo(
    () => ({ user, ready, isAuthenticated: !!user, login, register, logout, updateProfile }),
    [user, ready, login, register, logout, updateProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
