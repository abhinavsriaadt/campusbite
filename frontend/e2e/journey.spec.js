// The full order journey through the real UI (SPEC §2, §4, §5, §6):
// a new customer registers, browses, filters, fills the cart, pays (mock) and cancels one order;
// the owner runs the kitchen and assigns a rider; the rider delivers; the customer reviews and
// asks for a refund; the owner approves it.
import { API, DEMO, api, clearCart, expect, inr, loginUI, test, withSession } from "./fixtures.js";

test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const customerEmail = `e2e.${stamp}@example.com`;
const PW = "E2eCustomer1";
const state = {}; // shared across the serial steps: sessions and order ids

const prices = async (page) =>
  (await page.locator(".dish__price").allInnerTexts()).map((t) => Number(t.replace(/[^\d.]/g, "")));

test("customer registers, browses by category, searches, filters by price, fills the cart and checks out", async ({ page }) => {
  // Register (customer role is the default) → signed in straight away on the customer home.
  await page.goto("/register");
  await page.getByLabel("Full name").fill("E2E Customer");
  await page.getByLabel("Email").fill(customerEmail);
  await page.getByLabel("Password", { exact: true }).fill(PW);
  await page.getByLabel("Confirm password").fill(PW);
  await page.getByLabel("Delivery address").fill("Room 12, Hostel B, Lucknow University");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  await expect(page.getByRole("button", { name: /Account menu for E2E Customer/ })).toBeVisible();
  state.customer = await page.evaluate(() => ({ token: localStorage.getItem("campusbite_token"), user: localStorage.getItem("campusbite_user") }));
  await clearCart(page);

  // Browse by category: the Coffee chip (from GET /categories) filters through the join table.
  const coffee = (await api("/restaurants?category=coffee&size=100")).items.map((r) => r.name);
  await page.getByRole("button", { name: /^Coffee\b/ }).click();
  await page.waitForURL(/[?&]category=coffee\b/);
  await expect(page.locator(".list-count")).toHaveText(`${coffee.length} restaurants in Coffee`);
  for (const name of await page.locator(".rcard__name").allInnerTexts()) expect(coffee).toContain(name);
  await expect(page.locator(".rcard", { hasText: "for two" }).first()).toBeVisible();

  // Open Starbucks from the category: its coffee dishes are highlighted.
  await page.getByRole("link", { name: /^Starbucks/ }).click();
  await page.waitForURL(/\/restaurants\/\d+\?tag=coffee/);
  await expect(page.locator(".dish--match").first()).toBeVisible();
  state.starbucks = Number(new URL(page.url()).pathname.split("/").pop());

  // Search dishes by name (server-side search; count matches the API).
  const latte = await api(`/restaurants/${state.starbucks}/menu?search=latte`);
  await page.getByLabel("Search dishes").fill("latte");
  await expect(page.locator(".dish")).toHaveCount(latte.total);
  for (const n of await page.locator(".dish__name").allInnerTexts()) expect(n.toLowerCase()).toContain("latte");
  await page.getByLabel("Search dishes").fill("");

  // Filter by price.
  const band = await api(`/restaurants/${state.starbucks}/menu?min_price=300&max_price=400`);
  await page.getByLabel("Minimum price").fill("300");
  await page.getByLabel("Maximum price").fill("400");
  await expect(page.locator(".dish")).toHaveCount(band.total);
  for (const p of await prices(page)) expect(p).toBeGreaterThanOrEqual(300), expect(p).toBeLessThanOrEqual(400);
  await page.getByLabel("Minimum price").fill("");
  await page.getByLabel("Maximum price").fill("");
  await expect(page.locator(".dish")).toHaveCount((await api(`/restaurants/${state.starbucks}/menu`)).total);

  // Cart: add, update quantity, remove.
  await page.getByRole("button", { name: "Add Cappuccino to cart" }).click();
  await page.getByRole("button", { name: "Add Caramel Macchiato to cart" }).click();
  await page.getByRole("button", { name: "Add one Caramel Macchiato" }).click();
  await page.getByRole("button", { name: "Add Hot Mocha to cart" }).click();
  await expect(page.locator(".cartbar")).toContainText("4 items");
  await page.locator(".cartbar").click();
  await page.waitForURL("/cart");
  await page.getByRole("button", { name: "Remove one Hot Mocha" }).click();
  await expect(page.getByText("Hot Mocha")).toHaveCount(0);

  // Checkout with the dummy payment; the pay button shows the server's own quote.
  const full = await api(`/restaurants/${state.starbucks}/menu`);
  const id = (n) => full.sections.flatMap((s) => s.items).find((d) => d.name === n).id;
  const quote = await api("/orders/quote", {
    method: "POST", token: state.customer.token,
    body: { restaurant_id: state.starbucks, items: [{ menu_item_id: id("Cappuccino"), quantity: 1 }, { menu_item_id: id("Caramel Macchiato"), quantity: 2 }] },
  });
  state.pay = inr(quote.total);
  const pay = page.getByRole("button", { name: `Pay ${state.pay} (mock)` });
  await pay.click();
  await expect(page.getByText("Order placed!")).toBeVisible();
  await page.getByRole("link", { name: "Track order" }).click();
  await page.waitForURL(/\/orders\/\d+$/);
  state.orderId = Number(page.url().split("/").pop());
  await expect(page.locator(".badge", { hasText: /^Paid$/ }).first()).toBeVisible();
  await expect(page.locator(".badge", { hasText: /^Order placed$/ }).first()).toBeVisible();

  // It shows in "My orders".
  await page.goto("/orders");
  await expect(page.locator(".orow, .live", { hasText: `#${state.orderId}` }).first()).toBeVisible();
});

test("customer cancels a PLACED order and is refunded automatically", async ({ page }) => {
  await withSession(page, state.customer);
  const dish = (await api(`/restaurants/${state.starbucks}/menu?search=espresso`)).sections[0].items[0];
  const order = await api("/orders", {
    method: "POST", token: state.customer.token,
    body: { restaurant_id: state.starbucks, items: [{ menu_item_id: dish.id, quantity: 1 }], delivery_address: "Room 12, Hostel B", payment_method: "card" },
  });
  await page.goto(`/orders/${order.id}`);
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel order" }).click();
  await expect(page.locator(".badge", { hasText: /^Cancelled$/ }).first()).toBeVisible();
  await expect(page.locator(".badge", { hasText: /^Refunded$/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);
});

test("owner sees the order, moves it to READY and assigns a delivery partner", async ({ page }) => {
  state.owner = await loginUI(page, DEMO.owner);
  await expect(page.getByText("Orders today")).toBeVisible();
  await page.goto("/owner/orders");
  const card = () => page.locator(".kcard", { has: page.getByRole("link", { name: `#${state.orderId}`, exact: true }) });
  await expect(card()).toBeVisible();
  for (const [label, column] of [["Accept", "Accepted"], ["Start preparing", "Preparing"], ["Mark ready", "Ready"]]) {
    await card().getByRole("button", { name: label, exact: true }).click();
    await expect(page.locator(".kanban__col", { hasText: column }).locator(".kcard", { hasText: `#${state.orderId}` })).toBeVisible();
  }
  await card().getByRole("button", { name: "Assign rider" }).click();
  await page.locator(".modal label", { hasText: "Imran Khan" }).click();
  await page.locator(".modal").getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.locator(".kanban__col", { hasText: "Out" }).locator(".kcard", { hasText: `#${state.orderId}` })).toBeVisible();
});

test("delivery partner sees only their order with delivery details and delivers it (390px)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginUI(page, DEMO.rider);
  const card = page.locator(".dcard", { hasText: `Order #${state.orderId}` });
  await expect(card).toBeVisible();
  await expect(card.locator('a[href^="tel:"]')).toHaveCount(1);
  await expect(card).toContainText("Hostel B");
  await card.getByRole("button", { name: "Picked up · Start delivery" }).click();
  await card.getByRole("button", { name: "Mark delivered" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Yes, delivered" }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByText(`#${state.orderId} · Starbucks`)).toBeVisible();
});

test("customer reviews the delivered order and requests a refund; reorder re-quotes on the server", async ({ page }) => {
  await withSession(page, state.customer);
  await page.goto(`/orders/${state.orderId}`);
  await expect(page.locator(".badge", { hasText: /^Delivered$/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Rate", exact: true }).click();
  await page.getByRole("radio", { name: "5 stars" }).click();
  await page.getByLabel("Tell others about it (optional)").fill("Perfect cappuccino, still hot!");
  await page.getByRole("button", { name: "Submit review" }).click();
  await expect(page.getByText("Perfect cappuccino, still hot!")).toBeVisible();

  await page.getByRole("button", { name: "Request refund" }).click();
  await page.getByLabel("What went wrong?").fill("One macchiato was missing from the bag.");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".badge", { hasText: "Refund requested" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Request refund" })).toHaveCount(0); // one per order

  await clearCart(page);
  await page.goto("/orders");
  await page.getByRole("tab", { name: /Past/ }).click();
  await page.locator(".orow", { hasText: `Order #${state.orderId}` }).getByRole("button", { name: "Reorder" }).click();
  await page.waitForURL("/cart");
  await expect(page.getByRole("button", { name: `Pay ${state.pay} (mock)` })).toBeVisible();
  await clearCart(page);
});

test("owner approves the refund: order REFUNDED with a refund ledger entry", async ({ page }) => {
  await withSession(page, state.owner);
  await page.goto("/owner/returns");
  await page.locator("article", { hasText: `Order #${state.orderId}` }).getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve refund" }).click();
  await expect(page.locator(".toast--success").first()).toBeVisible();
  await page.goto(`/orders/${state.orderId}`);
  await expect(page.locator(".badge", { hasText: "Refund approved" }).first()).toBeVisible();
  const ledger = page.locator(".card", { has: page.locator("h3", { hasText: /^Payment$/ }) });
  await expect(ledger).toContainText("Refund");
  const order = await api(`/orders/${state.orderId}`, { token: state.owner.token });
  expect(order.status).toBe("REFUNDED");
  expect(order.payment_status).toBe("refunded");
  expect(order.payments.map((p) => p.entry_type)).toEqual(["PAYMENT", "REFUND"]);
});

test("API rejects what the UI hides: a customer token can't use owner endpoints", async () => {
  const r = await fetch(`${API}/owner/stats`, { headers: { Authorization: `Bearer ${state.customer.token}` } });
  expect(r.status).toBe(403);
});
