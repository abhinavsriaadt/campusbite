import axios from "axios";

export const TOKEN_KEY = "campusbite_token";
export const USER_KEY = "campusbite_user";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000/api").replace(/\/$/, "");

const api = axios.create({ baseURL: API_BASE_URL, timeout: 45000 });

// Attach the JWT from localStorage to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 on an authenticated request means the session expired → global logout.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) {
      window.dispatchEvent(new CustomEvent("campusbite:unauthorized"));
    }
    return Promise.reject(err);
  },
);

/** Turn any API error into a human-readable message. */
export function errorMessage(err, fallback = "Something went wrong. Please try again.") {
  if (!err) return fallback;
  if (err.code === "ECONNABORTED") return "The request timed out. Please try again.";
  if (!err.response) return "Can't reach the CampusBite server. Check that the backend is running.";
  const { status, data } = err.response;
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((d) => {
        const field = Array.isArray(d.loc) ? d.loc.filter((p) => p !== "body").join(".") : "";
        const msg = (d.msg || "").replace(/^Value error, /, "");
        return field ? `${field}: ${msg}` : msg;
      })
      .join(" • ");
  }
  if (status === 429) return "Too many requests — please wait a moment.";
  if (status >= 500) return "The server had a problem. Please try again shortly.";
  return fallback;
}

export default api;
