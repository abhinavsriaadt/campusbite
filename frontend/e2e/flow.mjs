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
const PW = "CampusBite@123";
const ACCOUNTS = {
  customer: "customer@campusbite.dev",
  owner: "owner@campusbite.dev",
  rider: "rider@campusbite.dev",
};

mkdirSync(OUT, { recursive: true });
const consoleErrors = [];
let passed = 0;

const browser = await chromium.launch({ executablePath: CHROME, headless: !process.env.E2E_HEADED });

async function session(email, viewport = { width: 1366, height: 900 }, colorScheme = "light") {
  const ctx = await browser.newContext({ viewport, colorScheme });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(`[${email || "guest"}] ${m.text()}`));
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

  await page.getByRole("link", { name: /^Spice Route/ }).click();
  await page.waitForSelector(".dish");
  await page.getByRole("button", { name: "Add Butter Chicken to cart" }).click();
  await page.getByRole("button", { name: "Add Garlic Naan to cart" }).click();
  await page.getByRole("button", { name: "Add one Garlic Naan" }).click();
  await page.waitForSelector(".cartbar");
  ok("added Butter Chicken ×1 and Garlic Naan ×2; sticky cart bar shown");

  await page.getByLabel("Search dishes").fill("naan");
  await page.waitForFunction(() => document.querySelectorAll(".dish").length === 2);
  ok("menu search narrows to the 2 naan dishes");

  await page.locator(".cartbar").click();
  await page.waitForURL(`${BASE}/cart`);
  const payBtn = page.getByRole("button", { name: /^Pay .* \(mock\)$/ });
  await payBtn.waitFor();
  const payText = (await payBtn.textContent()).trim();
  if (!payText.includes("512.50")) throw new Error(`unexpected server quote: ${payText}`);
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
  await page.locator(".modal label", { hasText: "Ravi Kumar" }).click();
  await page.locator(".modal").getByRole("button", { name: "Assign", exact: true }).click();
  await page.locator(".kanban__col", { hasText: "Out" }).locator(".kcard", { hasText: "Rider assigned" }).first().waitFor();
  await shot(page, "04-owner-board");
  ok("owner assigned delivery partner Ravi Kumar (card moved to Out)");
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
  await page.waitForSelector(`text=#${orderId} · Spice Route`);
  ok("order appears in rider's delivery history");
  await ctx.close();

  // 4. Customer reviews, asks for a refund, and reorders --------------------------------
  ({ ctx, page } = await session(ACCOUNTS.customer));
  await page.goto(`${BASE}/orders/${orderId}`);
  await page.getByRole("button", { name: "Rate", exact: true }).click();
  await page.getByRole("radio", { name: "5 stars" }).click();
  await page.getByLabel("Tell others about it (optional)").fill("Fantastic butter chicken!");
  await page.getByRole("button", { name: "Submit review" }).click();
  await page.waitForSelector("text=Fantastic butter chicken!");
  ok("customer left a 5★ review");

  await page.getByRole("button", { name: "Request refund" }).click();
  await page.getByLabel("What went wrong?").fill("The naan was missing from the bag.");
  await page.getByRole("button", { name: "Send request" }).click();
  await page.locator(".badge", { hasText: "Refund requested" }).first().waitFor();
  ok("customer submitted a refund request");

  await page.goto(`${BASE}/orders`);
  await page.getByRole("tab", { name: /Past/ }).click();
  const row = page.locator(".orow", { hasText: `Order #${orderId}` });
  await row.getByRole("button", { name: "Reorder" }).click();
  await page.waitForURL(`${BASE}/cart`);
  await page.getByRole("button", { name: /^Pay .*512\.50 \(mock\)$/ }).waitFor();
  ok("Reorder rebuilt the cart from the past order (server re-quoted ₹512.50)");

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
  await page.getByRole("link", { name: /^Dosa Junction/ }).click();
  await page.waitForSelector(".dish");
  await page.getByRole("button", { name: /^Add .* to cart$/ }).first().click();
  await page.waitForSelector(".cartbar");
  // Adding from a second restaurant must ask before replacing the cart (one restaurant per order).
  await page.goBack();
  await page.getByRole("link", { name: /^Spice Route/ }).click();
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
