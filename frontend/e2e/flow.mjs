/**
 * CampusBite end-to-end smoke test — drives the real UI across all three roles.
 *
 *   Prereqs: backend running with demo data (SEED_DEMO_DATA=true) and `npm run dev`.
 *   Run:     npm run e2e
 *
 * Env:
 *   E2E_BASE_URL   frontend URL           (default http://localhost:5173)
 *   CHROME_PATH    Chrome/Chromium binary (default: macOS Google Chrome)
 *   E2E_HEADED=1   show the browser
 * Screenshots are written to e2e/screenshots/ (git-ignored).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = (process.env.E2E_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = new URL("./screenshots/", import.meta.url).pathname;
const PW = "Password@123"; // seeded demo password (backend/seed_data_lucknow.json)
const ACCOUNTS = {
  customer: "aarav@campusbite.dev",
  owner: "owner.starbucks@campusbite.dev",
  rider: "imran.rider@campusbite.dev",
};
const IMAGE_HOSTS = ["loremflickr.com"];
const API = (process.env.E2E_API_URL || "http://localhost:8000/api").replace(/\/$/, "");
const inr = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

mkdirSync(OUT, { recursive: true });
const consoleErrors = [];
let expectStatus = null; // an HTTP error the current step triggers on purpose (the browser logs it)
let passed = 0;

const browser = await chromium.launch({ executablePath: CHROME, headless: !process.env.E2E_HEADED });

async function session(email, viewport = { width: 1366, height: 900 }, colorScheme = "light") {
  const ctx = await browser.newContext({ viewport, colorScheme });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on("console", (m) => {
    if (m.type() !== "error" || (expectStatus && m.text().includes(`status of ${expectStatus}`))) return;
    // Demo photos are hotlinked from a third-party host; an outage there must not fail the run
    // (the UI falls back to its placeholder art). Errors from our own app still count.
    if (IMAGE_HOSTS.some((h) => (m.location()?.url || "").includes(h))) return;
    consoleErrors.push(`[${email || "guest"}] ${m.text()}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(`[${email || "guest"}] PAGEERROR ${e.message}`));
  if (email) {
    await page.goto(`${BASE}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PW);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  }
  return { ctx, page };
}

const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
const ok = (msg) => {
  passed++;
  console.log(`✓ ${msg}`);
};
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

try {
  // 1. Customer browses, searches and orders --------------------------------------------
  let { ctx, page } = await session(ACCOUNTS.customer);
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("campusbite_cart_")).forEach((k) => localStorage.removeItem(k)));
  await page.reload();
  await page.waitForSelector(".rcard");
  await shot(page, "01-restaurants");
  ok("customer sees restaurant listing");

  // Category chips come from GET /categories; the selection lives in the URL.
  await page.getByRole("button", { name: /^Coffee\b/ }).click();
  await page.waitForURL(/[?&]category=coffee\b/);
  const expectedCoffee = (await (await fetch(`${API}/restaurants?category=coffee&size=100`)).json()).items.map((r) => r.name);
  await page.locator(".list-count", { hasText: `${expectedCoffee.length} restaurants in Coffee` }).waitFor();
  await page.waitForSelector(".grid-cards:not(.is-refreshing)");
  const coffeeCards = await page.locator(".rcard__name").allInnerTexts();
  if (coffeeCards.length !== Math.min(12, expectedCoffee.length) || !coffeeCards.every((n) => expectedCoffee.includes(n))) {
    throw new Error(`coffee filter shows ${coffeeCards.join(", ")}`);
  }
  if (!(await page.locator(".rcard", { hasText: "for two" }).count())) throw new Error("cost for two missing on cards");
  ok(`Coffee chip filters to ${coffeeCards.length} restaurants (URL ?category=coffee), cards show cost for two`);

  await page.getByRole("link", { name: /^Starbucks/ }).click();
  await page.waitForURL(/\/restaurants\/\d+\?tag=coffee/);
  await page.waitForSelector(".dish--match");
  ok(`menu opened from Coffee highlights ${await page.locator(".dish--match").count()} coffee dishes`);

  await page.getByRole("button", { name: "Add Cappuccino to cart" }).click();
  await page.getByRole("button", { name: "Add Caramel Macchiato to cart" }).click();
  await page.getByRole("button", { name: "Add one Caramel Macchiato" }).click();
  await page.waitForSelector(".cartbar");
  ok("added Cappuccino ×1 and Caramel Macchiato ×2; sticky cart bar shown");

  const starbucksId = Number(new URL(page.url()).pathname.split("/").pop());
  const menu = await (await fetch(`${API}/restaurants/${starbucksId}/menu?search=latte`)).json();
  await page.getByLabel("Search dishes").fill("latte");
  await page.waitForFunction((n) => document.querySelectorAll(".dish").length === n, menu.total);
  ok(`menu search "latte" narrows to the server's ${menu.total} dishes`);

  // The expected price comes from the server's own quote for this basket.
  const full = await (await fetch(`${API}/restaurants/${starbucksId}/menu`)).json();
  const id = (name) => full.sections.flatMap((x) => x.items).find((d) => d.name === name).id;
  const basket = { restaurant_id: starbucksId, items: [{ menu_item_id: id("Cappuccino"), quantity: 1 }, { menu_item_id: id("Caramel Macchiato"), quantity: 2 }] };
  const quote = await page.evaluate(async ([api, body]) => {
    const r = await fetch(`${api}/orders/quote`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("campusbite_token")}` }, body: JSON.stringify(body) });
    return r.json();
  }, [API, basket]);
  const expectedPay = inr(quote.total);

  await page.locator(".cartbar").click();
  await page.waitForURL(`${BASE}/cart`);
  const payBtn = page.getByRole("button", { name: /^Pay .* \(mock\)$/ });
  await payBtn.waitFor();
  const payText = (await payBtn.textContent()).trim();
  if (!payText.includes(expectedPay)) throw new Error(`unexpected quote: ${payText} (server says ${expectedPay})`);
  await shot(page, "02-checkout");
  ok(`server-side quote shown (${payText})`);

  await payBtn.click();
  await page.waitForSelector("text=Order placed!");
  await page.getByRole("link", { name: "Track order" }).click();
  await page.waitForURL(/\/orders\/\d+$/);
  const orderId = Number(page.url().split("/").pop());
  await page.locator(".badge", { hasText: /^Paid$/ }).first().waitFor();
  ok(`order #${orderId} placed → success screen → tracking; payment is mock_paid`);
  await ctx.close();

  // 2. Owner runs the kitchen pipeline on the Kanban board and assigns a rider -----------
  ({ ctx, page } = await session(ACCOUNTS.owner));
  await page.waitForSelector("text=Orders today");
  await page.waitForSelector(".chart svg");
  await shot(page, "03-owner-dashboard");
  ok("owner dashboard renders stats and revenue chart");

  await page.goto(`${BASE}/owner/orders`);
  const kcard = () => page.locator(".kcard", { has: page.getByRole("link", { name: `#${orderId}`, exact: true }) });
  for (const [label, column] of [["Accept", "Accepted"], ["Start preparing", "Preparing"], ["Mark ready", "Ready"]]) {
    await kcard().getByRole("button", { name: label, exact: true }).click();
    await page.locator(".kanban__col", { hasText: column }).locator(".kcard", { hasText: `#${orderId}` }).waitFor();
    await page.locator(".toast--success").first().waitFor();
  }
  ok("owner board: New → Accepted → Preparing → Ready");

  await kcard().getByRole("button", { name: "Assign rider" }).click();
  await page.locator(".modal label", { hasText: "Imran Khan" }).click();
  await page.locator(".modal").getByRole("button", { name: "Assign", exact: true }).click();
  await page.locator(".kanban__col", { hasText: "Out" }).locator(".kcard", { hasText: "Rider assigned" }).first().waitFor();
  await shot(page, "04-owner-board");
  ok("owner assigned delivery partner Imran Khan (card moved to Out)");
  await ctx.close();

  // 3. Rider delivers (with confirmation) ------------------------------------------------
  ({ ctx, page } = await session(ACCOUNTS.rider, { width: 390, height: 844 }));
  const card = page.locator(".dcard", { hasText: `Order #${orderId}` });
  await card.waitFor();
  if (!(await card.locator('a[href^="tel:"]').count())) throw new Error("tap-to-call link missing on delivery card");
  await card.getByRole("button", { name: "Picked up · Start delivery" }).click();
  await card.getByRole("button", { name: "Mark delivered" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Yes, delivered" }).click();
  await card.waitFor({ state: "detached" });
  ok("rider (mobile): ASSIGNED → OUT_FOR_DELIVERY → DELIVERED after confirming");
  await page.getByRole("link", { name: "History" }).click();
  await page.waitForSelector(`text=#${orderId} · Starbucks`);
  ok("order appears in rider's delivery history");
  await ctx.close();

  // 4. Customer reviews, asks for a refund, and reorders --------------------------------
  ({ ctx, page } = await session(ACCOUNTS.customer));
  await page.goto(`${BASE}/orders/${orderId}`);
  await page.getByRole("button", { name: "Rate", exact: true }).click();
  await page.getByRole("radio", { name: "5 stars" }).click();
  await page.getByLabel("Tell others about it (optional)").fill("Perfect cappuccino, still hot!");
  await page.getByRole("button", { name: "Submit review" }).click();
  await page.waitForSelector("text=Perfect cappuccino, still hot!");
  ok("customer left a 5★ review");

  await page.getByRole("button", { name: "Request refund" }).click();
  await page.getByLabel("What went wrong?").fill("One macchiato was missing from the bag.");
  await page.getByRole("button", { name: "Send request" }).click();
  await page.locator(".badge", { hasText: "Refund requested" }).first().waitFor();
  ok("customer submitted a refund request");

  await page.goto(`${BASE}/orders`);
  await page.getByRole("tab", { name: /Past/ }).click();
  const row = page.locator(".orow", { hasText: `Order #${orderId}` });
  await row.getByRole("button", { name: "Reorder" }).click();
  await page.waitForURL(`${BASE}/cart`);
  await page.getByRole("button", { name: `Pay ${expectedPay} (mock)` }).waitFor();
  ok(`Reorder rebuilt the cart from the past order (server re-quoted ${expectedPay})`);

  await page.goto(`${BASE}/insights`);
  await page.waitForSelector("text=AI order insights");
  ok("AI insights page renders");
  await ctx.close();

  // 5. Owner approves the refund (confirm step) -----------------------------------------
  ({ ctx, page } = await session(ACCOUNTS.owner));
  await page.goto(`${BASE}/owner/returns`);
  await page.locator("article", { hasText: `Order #${orderId}` }).getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve refund" }).click();
  await page.locator(".toast--success").first().waitFor();
  await page.goto(`${BASE}/orders/${orderId}`);
  await page.locator(".badge", { hasText: "Refund approved" }).first().waitFor();
  const ledger = await page.locator(".card", { has: page.locator("h3", { hasText: /^Payment$/ }) }).innerText();
  if (!ledger.includes("Refund")) throw new Error("refund ledger entry missing");
  await shot(page, "05-refunded-order");
  ok("owner approved refund → order REFUNDED with a refund ledger entry");

  await page.goto(`${BASE}/cart`);
  await page.waitForURL(`${BASE}/owner`);
  ok("owner is redirected away from customer-only /cart");
  await ctx.close();

  // 6. Mobile + dark mode ----------------------------------------------------------------
  ({ ctx, page } = await session(ACCOUNTS.customer, { width: 390, height: 844 }, "dark"));
  await page.waitForSelector(".rcard");
  if (!(await noOverflow(page))) throw new Error("horizontal overflow on mobile restaurant list");
  if (!(await page.locator(".tabbar").isVisible())) throw new Error("bottom tab bar missing on mobile");
  await page.getByRole("link", { name: /^Royal Cafe/ }).click();
  await page.waitForSelector(".dish");
  await page.getByRole("button", { name: /^Add .* to cart$/ }).first().click();
  await page.waitForSelector(".cartbar");
  // Adding from a second restaurant must ask before replacing the cart (one restaurant per order).
  await page.goBack();
  await page.getByRole("link", { name: /^Tunday Kababi/ }).click();
  await page.getByRole("button", { name: /^Add .* to cart$/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Start fresh" }).click();
  await page.locator(".cartbar", { hasText: "1 item" }).waitFor();
  if (!(await noOverflow(page))) throw new Error("horizontal overflow on mobile menu");
  await shot(page, "06-mobile-dark-menu");
  ok("mobile (390px) dark mode: tab bar, no horizontal overflow, cart-conflict prompt works");
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("campusbite_cart_")).forEach((k) => localStorage.removeItem(k)));
  await ctx.close();

  // 7. Guests are sent to login ----------------------------------------------------------
  ({ ctx, page } = await session(null));
  await page.goto(`${BASE}/orders`);
  await page.waitForURL(`${BASE}/login`);
  await page.waitForSelector("text=Welcome back");
  ok("guest visiting /orders is redirected to /login");

  // 8. Theme: toggle on the auth page, persisted as cb_theme, applied before React mounts ---
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  if ((await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem("cb_theme")])).join() !== "dark,dark") {
    throw new Error("theme toggle did not apply/persist dark");
  }
  await page.addInitScript(() => document.addEventListener("readystatechange", () => {
    window.__themeAtFirstState ??= document.documentElement.dataset.theme;
  }, { once: true }));
  await page.reload();
  if (await page.evaluate(() => window.__themeAtFirstState) !== "dark") throw new Error("dark theme not set before first paint");
  ok("theme toggle works before login, persists, and is applied before React mounts (no flash)");
  await ctx.close();

  // 9. Sign-up signs you in straight away; a wrong password shows the inline error --------
  ({ ctx, page } = await session(null, { width: 375, height: 812 }, "dark"));
  const newEmail = `e2e.${Date.now().toString(36)}@example.com`;
  await page.goto(`${BASE}/register`);
  await page.getByLabel("Full name").fill("E2E Signup");
  await page.getByLabel("Email").fill(newEmail);
  await page.getByLabel("Password", { exact: true }).fill("E2eSignup1");
  await page.getByLabel("Confirm password").fill("E2eSignup1");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(`${BASE}/`);
  if (!(await page.evaluate((k) => localStorage.getItem(k), "campusbite_token"))) throw new Error("no token after sign-up");
  await page.reload();
  await page.getByRole("button", { name: /Account menu for E2E Signup/ }).waitFor();
  if (!(await noOverflow(page))) throw new Error("horizontal overflow after sign-up at 375px");
  ok("sign-up stores the token and lands on the customer home; refresh keeps the session");
  await page.getByRole("button", { name: /Account menu for/ }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await page.waitForURL(`${BASE}/login`);
  await page.getByLabel("Email").fill(newEmail);
  await page.getByLabel("Password").fill("Wrong1234");
  expectStatus = 401;
  await page.getByRole("button", { name: "Log in" }).click();
  await page.locator(".alert", { hasText: "Invalid email or password." }).waitFor();
  expectStatus = null;
  await shot(page, "09-login-wrong-password-dark");
  ok("wrong password shows the inline error");
  await ctx.close();
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} passing step(s): ${err.message}`);
  await browser.close();
  process.exit(1);
}

await browser.close();
if (consoleErrors.length) {
  console.error(`\n✗ ${consoleErrors.length} browser console error(s):\n${consoleErrors.join("\n")}`);
  process.exit(1);
}
console.log(`\nAll ${passed} steps passed, no console errors. Screenshots: e2e/screenshots/`);
