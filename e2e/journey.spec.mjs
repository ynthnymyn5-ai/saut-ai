/**
 * SAUT AI end-to-end journey (local Supabase, no external providers configured).
 * Covers: sign-up → onboarding → knowledge → products/order (server-side totals) → customer →
 * appointment → inbox API → AI test chat with NO key (must fail honestly, never fake a reply)
 * → second business cannot read the first one's data → logout/login → mobile layout.
 */
import { test, expect } from "@playwright/test";

const stamp = Date.now();
const A = { email: `owner.a.${stamp}@e2e.test`, password: "E2e-password-123", name: "Owner A", company: "Cafe A" };
const B = { email: `owner.b.${stamp}@e2e.test`, password: "E2e-password-456", name: "Owner B", company: "Cafe B" };
const shared = {};

async function signUpAndOnboard(page, u, business) {
  await page.goto("/signup");
  await page.fill("#fullName", u.name);
  await page.fill("#company", u.company);
  await page.fill("#email", u.email);
  await page.fill("#password", u.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/onboarding/);
  await page.fill("#ob-name", business);
  await page.locator('form button[type="submit"]').click();               // step 1 → 2
  await page.locator('button[role="radio"]').first().click();              // pick an industry
  await page.locator('form button[type="submit"]').click();               // step 2 → 3
  await page.locator('form button[type="submit"]').click();               // create business
  await page.waitForURL(/\/dashboard/);
}

test.describe.serial("SAUT AI journey", () => {
  test("unauthenticated API calls are rejected", async ({ request }) => {
    for (const path of ["/api/orders", "/api/products", "/api/conversations", "/api/appointments"]) {
      const r = await request.get(path);
      expect(r.status(), path).toBe(401);
    }
    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();
  });

  test("owner A signs up, onboards and builds the business", async ({ page }) => {
    await signUpAndOnboard(page, A, `E2E Cafe ${stamp}`);
    await expect(page.locator("body")).toContainText(/E2E Cafe/);
    const api = page.request;

    // Knowledge
    let r = await api.post("/api/knowledge/upload", { data: { title: "Parking FAQ", text: "Q: Is there parking?\nA: Yes, free parking behind the building." } });
    expect(r.status()).toBe(201);
    shared.docId = (await r.json()).document.id;
    await page.goto("/dashboard/knowledge");
    await expect(page.getByText("Parking FAQ")).toBeVisible();

    // Products and an order — the client never sends prices
    r = await api.post("/api/products", { data: { name: "Latte", price: 1.5 } });
    expect(r.status()).toBe(201);
    const latte = (await r.json()).id;
    r = await api.post("/api/products", { data: { name: "Cookie", price: 0.75 } });
    const cookie = (await r.json()).id;
    r = await api.post("/api/orders", { data: { items: [{ product_id: latte, quantity: 2 }, { product_id: cookie, quantity: 1 }], customer_name: "Fatima", phone: "+96550001111" } });
    expect(r.status()).toBe(201);
    const order = await r.json();
    expect(order.order_no).toBe(1001);
    expect(Number(order.total)).toBeCloseTo(3.75, 3);
    shared.orderId = order.id;
    // invalid transition is refused, valid one accepted
    expect((await api.patch(`/api/orders/${order.id}`, { data: { status: "pending" } })).status()).toBe(409);
    expect((await api.patch(`/api/orders/${order.id}`, { data: { status: "preparing" } })).status()).toBe(200);
    await page.goto("/dashboard/orders");
    await expect(page.getByText("#1001")).toBeVisible();

    // Customer was created from the order's phone number
    await page.goto("/dashboard/customers");
    await expect(page.getByText("Fatima").first()).toBeVisible();

    // Appointment tomorrow 12:00 Kuwait time (inside default hours)
    const d = new Date(Date.now() + 86400000);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(d);
    r = await api.post("/api/appointments", { data: { customer_name: "Fatima", phone: "+96550001111", starts_at: `${day}T12:00:00+03:00`, duration_min: 30 } });
    expect(r.status()).toBe(201);
    // Outside opening hours is refused with alternatives unless overridden
    r = await api.post("/api/appointments", { data: { customer_name: "Late", phone: "+96550002222", starts_at: `${day}T23:30:00+03:00`, duration_min: 30 } });
    expect(r.status()).toBe(409);
    expect((await r.json()).error.alternatives.length).toBeGreaterThan(0);

    // Inbox API responds for real data
    r = await api.get("/api/conversations");
    expect(r.ok()).toBeTruthy();

    // AI test chat with NO provider key: honest error, never a fabricated reply
    r = await api.post("/api/ai/chat", { data: { messages: [{ role: "user", content: "Is there parking?" }], employee: { name: "Sara", industry: "restaurant", dialect: "kuwaiti", businessInfo: { businessName: "E2E Cafe" } } } });
    expect(r.status()).toBe(503);
    expect((await r.json()).error.code).toBe("provider_not_configured");
  });

  test("owner B cannot read or change business A's data", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signUpAndOnboard(page, B, `Other Cafe ${stamp}`);
    const api = page.request;
    expect((await api.get(`/api/orders/${shared.orderId}`)).status()).toBe(404);
    expect((await api.patch(`/api/orders/${shared.orderId}`, { data: { status: "canceled" } })).status()).toBe(404);
    expect((await api.get(`/api/knowledge/${shared.docId}`)).status()).toBe(404);
    expect((await api.delete(`/api/knowledge/${shared.docId}`)).status()).toBe(404);
    expect((await (await api.get("/api/orders")).json()).orders).toHaveLength(0);
    expect((await (await api.get("/api/products")).json()).products).toHaveLength(0);
    await ctx.close();
  });

  test("owner A logs out and back in; data persists", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", A.email);
    await page.fill("#password", A.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/);
    await page.goto("/dashboard/orders");
    await expect(page.getByText("#1001")).toBeVisible();
    // order is still "preparing" after the other business's cancel attempt
    const o = await (await page.request.get(`/api/orders/${shared.orderId}`)).json();
    expect(o.order.status).toBe("preparing");
    // sign out
    await page.request.post("/auth/signout");
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/);
    // wrong password is refused
    await page.fill("#email", A.email);
    await page.fill("#password", "wrong-password-1");
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("dashboard pages fit a phone screen without horizontal scrolling", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.fill("#email", A.email);
    await page.fill("#password", A.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/);
    for (const path of ["/dashboard", "/dashboard/conversations", "/dashboard/orders", "/dashboard/appointments", "/dashboard/knowledge", "/dashboard/customers"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  });
});
