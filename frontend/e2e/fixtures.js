// Shared helpers for the Playwright suite.
import { test as base, expect } from "@playwright/test";

export const API = (process.env.E2E_API_URL || "http://localhost:8000/api").replace(/\/$/, "");
export const DEMO_PASSWORD = "Password@123";
export const DEMO = {
  owner: "owner.starbucks@campusbite.dev",
  rider: "imran.rider@campusbite.dev",
  customer: "aarav@campusbite.dev",
};
// Demo photos are hotlinked from a third-party host; an outage there must not fail the run
// (the UI shows its placeholder art instead). Errors from our own app always fail the test.
const IMAGE_HOSTS = ["loremflickr.com"];

export const inr = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

/**
 * `page` fails the test on any browser console error or uncaught exception.
 * A test that triggers an HTTP error on purpose calls `allowStatus(401)` first.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    const allowed = new Set();
    page.allowStatus = (code) => allowed.add(code);
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      if (IMAGE_HOSTS.some((h) => (m.location()?.url || "").includes(h))) return;
      if ([...allowed].some((code) => m.text().includes(`status of ${code}`))) return;
      errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    await use(page);
    expect(errors, "browser console errors").toEqual([]);
  },
});
export { expect };

/** Log in through the UI and return the stored session (token + user). */
export async function loginUI(page, email, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return session(page);
}

export const session = (page) =>
  page.evaluate(() => ({ token: localStorage.getItem("campusbite_token"), user: localStorage.getItem("campusbite_user") }));

/** Reuse a session in a new page without logging in again (keeps clear of the login rate limit). */
export async function withSession(page, s) {
  await page.addInitScript(([t, u]) => {
    localStorage.setItem("campusbite_token", t);
    localStorage.setItem("campusbite_user", u);
  }, [s.token, s.user]);
}

export async function api(path, { token, method = "GET", body } = {}) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

export const noHorizontalScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

export const clearCart = (page) =>
  page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("campusbite_cart_")).forEach((k) => localStorage.removeItem(k)));
