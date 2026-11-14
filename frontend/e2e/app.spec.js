// Cross-cutting UI checks: role-protected routes, auth errors, dark mode, AI page and
// responsive layouts at 375 / 768 / 1280 px (SPEC §3, §7, §9).
import { DEMO, DEMO_PASSWORD, api, clearCart, expect, noHorizontalScroll, test, withSession } from "./fixtures.js";

// One API login per demo account for the whole file (keeps clear of the login rate limit).
let customer, owner, rider, restaurantId;
const login = async (email) => {
  const r = await api("/auth/login", { method: "POST", body: { email, password: DEMO_PASSWORD } });
  return { token: r.access_token, user: JSON.stringify(r.user) };
};

test.beforeAll(async () => {
  [customer, owner, rider] = await Promise.all([
    login(DEMO.customer), login("owner.tundaykababi@campusbite.dev"), login(DEMO.rider),
  ]);
  restaurantId = (await api("/restaurants?page_size=1")).items[0].id;
});

test("a customer visiting /owner pages is redirected; guests are sent to login", async ({ page }) => {
  await withSession(page, customer);
  for (const path of ["/owner", "/owner/orders", "/owner/menu", "/delivery"]) {
    await page.goto(path);
    await page.waitForURL("/");
  }
  const guest = await page.context().browser().newPage();
  await guest.goto("/orders");
  await guest.waitForURL("/login");
  await expect(guest.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await guest.close();
});

test("wrong password shows the inline error; a session survives a refresh", async ({ page }) => {
  page.allowStatus(401);
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO.customer);
  await page.getByLabel("Password").fill("Wrong1234x");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.locator(".alert", { hasText: "Invalid email or password." })).toBeVisible();

  await withSession(page, customer);
  await page.goto("/orders");
  await page.reload();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByRole("button", { name: /Account menu for/ })).toBeVisible();
});

test("dark-mode toggle works before login, persists, and applies before React mounts", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("cb_theme"))).toBe("dark");
  await page.addInitScript(() => document.addEventListener("readystatechange", () => {
    window.__themeAtFirstState ??= document.documentElement.dataset.theme;
  }, { once: true }));
  await page.reload();
  expect(await page.evaluate(() => window.__themeAtFirstState)).toBe("dark");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("AI insights page renders for the customer", async ({ page }) => {
  await withSession(page, customer);
  await page.goto("/insights");
  await expect(page.getByText("AI order insights")).toBeVisible();
});

test("one restaurant per cart: adding from a second restaurant asks first (390px, dark)", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  await withSession(page, customer);
  await page.goto("/");
  await clearCart(page);
  await expect(page.locator(".tabbar")).toBeVisible();
  await page.getByRole("link", { name: /^Royal Cafe/ }).click();
  await page.getByRole("button", { name: /^Add .* to cart$/ }).first().click();
  await expect(page.locator(".cartbar")).toBeVisible();
  await page.goBack();
  await page.getByRole("link", { name: /^Tunday Kababi/ }).click();
  await page.getByRole("button", { name: /^Add .* to cart$/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Start fresh" }).click();
  await expect(page.locator(".cartbar", { hasText: "1 item" })).toBeVisible();
  await clearCart(page);
  await ctx.close();
});

// Responsive: no horizontal scroll on any page, for every role, at phone / tablet / desktop.
const PAGES = {
  guest: ["/", "/?category=cafe", "/restaurants/:id", "/login", "/register"],
  customer: ["/", "/cart", "/orders", "/insights", "/profile"],
  owner: ["/owner", "/owner/orders", "/owner/menu", "/owner/returns", "/owner/settings"],
  rider: ["/delivery", "/delivery/history"],
};

for (const width of [375, 768, 1280]) {
  for (const scheme of ["light", "dark"]) {
    test(`no horizontal scroll at ${width}px (${scheme})`, async ({ browser }) => {
      const sessions = { guest: null, customer, owner, rider };
      for (const [role, paths] of Object.entries(PAGES)) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
        const page = await ctx.newPage();
        if (sessions[role]) await withSession(page, sessions[role]);
        for (const path of paths) {
          await page.goto(path.replace(":id", restaurantId));
          await page.waitForLoadState("networkidle");
          expect(await noHorizontalScroll(page), `${role} ${path} at ${width}px ${scheme}`).toBe(true);
        }
        await ctx.close();
      }
    });
  }
}

test("owner dashboard shows reminders for stale orders", async ({ page }) => {
  await withSession(page, owner);
  await page.goto("/owner");
  await expect(page.getByRole("heading", { name: /Reminders/ })).toBeVisible();
  await expect(page.locator(".reminder").first()).toContainText(/waiting/);
});
