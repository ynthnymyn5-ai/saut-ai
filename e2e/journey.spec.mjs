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
    // sign-in links can't be abused to send people to another site
    for (const next of ["/\\evil.example", "//evil.example", "https://evil.example"]) {
      const r = await request.get(`/auth/callback?next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
      expect(r.status()).toBeGreaterThanOrEqual(300);
      expect(r.headers()["location"] ?? "").not.toContain("evil.example");
    }
  });

  test("landing page feature cards open details", async ({ page }) => {
    await page.goto("/");
    await page.locator("#features button").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: /Start|ابدأ/ })).toHaveAttribute("href", "/signup");
    await dialog.getByRole("button", { name: /Close|إغلاق/ }).click();
    await expect(dialog).toBeHidden();
    await page.locator("#how button").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("Google button is hidden when Google sign-in isn't enabled in Supabase", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#email")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Google/)).toHaveCount(0); // local Supabase has Google disabled
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
    // sign out with the real button (no manual cookie clearing): the session must be gone
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Sign out|تسجيل الخروج/ }).first().click();
    await page.waitForURL(/\/login/);
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/);
    expect((await page.request.get("/api/orders")).status()).toBe(401);
    // wrong password is refused
    await page.fill("#email", A.email);
    await page.fill("#password", "wrong-password-1");
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("delivery: areas with fees, address required, out for delivery with a driver", async ({ page, browser }) => {
    await page.goto("/login");
    await page.fill("#email", A.email); await page.fill("#password", A.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/);
    const api = page.request;
    let r = await api.post("/api/delivery-zones", { data: { name: "Salmiya", areas: ["Hawally"], fee: 1, min_order: 2 } });
    expect(r.status()).toBe(201);
    const zone = (await r.json()).id;
    const latte = (await (await api.get("/api/products")).json()).products.find((p) => p.name === "Latte").id;
    // incomplete address refused
    r = await api.post("/api/orders", { data: { items: [{ product_id: latte, quantity: 2 }], fulfillment: "delivery", zone_id: zone, address: { area: "Salmiya" } } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    // area not served refused
    r = await api.post("/api/orders", { data: { items: [{ product_id: latte, quantity: 2 }], fulfillment: "delivery", address: { area: "Jahra", block: "1", house: "2" } } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    // below the area's minimum refused
    r = await api.post("/api/orders", { data: { items: [{ product_id: latte, quantity: 1 }], fulfillment: "delivery", zone_id: zone, address: { area: "Salmiya", block: "10", house: "5" } } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    // matched by the zone's extra area name; fee added by the server
    r = await api.post("/api/orders", { data: { items: [{ product_id: latte, quantity: 2 }], customer_name: "Noura", phone: "+96550003333", fulfillment: "delivery", address: { area: "hawally", block: "3", street: "Tunis", house: "12" } } });
    expect(r.status()).toBe(201);
    const order = await r.json();
    expect(Number(order.total)).toBeCloseTo(4, 3);
    for (const st of ["confirmed", "preparing", "ready"]) expect((await api.patch(`/api/orders/${order.id}`, { data: { status: st } })).status()).toBe(200);
    const me = (await (await api.get("/api/members")).json()).me;
    expect((await api.patch(`/api/orders/${order.id}`, { data: { driver_user: me } })).status()).toBe(200);
    // driver screen lists the assigned order with a map link
    const drv = await (await api.get("/api/driver/orders")).json();
    const mine = drv.active.find((o) => o.id === order.id);
    expect(mine.maps).toContain("google.com/maps");
    expect(mine.addressText).toContain("Tunis");
    r = await api.patch(`/api/orders/${order.id}`, { data: { status: "out_for_delivery" } });
    expect(r.status()).toBe(200);
    // customer tracking link: public, shows status, never phone/name/address
    const det = await (await api.get(`/api/orders/${order.id}`)).json();
    expect(det.order.trackingUrl).toMatch(/\/t\/[0-9a-f]{64}$/);
    const token = det.order.trackingUrl.split("/t/")[1];
    const anon = await browser.newContext();
    const tr = await anon.request.get(`/api/track/${token}`);
    expect(tr.status()).toBe(200);
    const trk = await tr.json();
    expect(trk.status).toBe("out_for_delivery");
    expect(JSON.stringify(trk)).not.toContain("+96550003333");
    expect(JSON.stringify(trk)).not.toContain("Noura");
    expect(JSON.stringify(trk)).not.toContain("Tunis");
    expect((await anon.request.get(`/api/track/${"0".repeat(64)}`)).status()).toBe(404);
    const tp = await anon.newPage();
    await tp.goto(`/t/${token}`);
    await expect(tp.getByText(/On the way|في الطريق إليك/)).toBeVisible();
    await anon.close();
    // print page renders the kitchen ticket and receipt
    await page.goto(`/print/order/${order.id}?part=both`);
    await expect(page.getByText("تذكرة المطبخ")).toBeVisible();
    await expect(page.getByText(/الإجمالي/)).toBeVisible();
    // saved replies
    expect((await api.post("/api/saved-replies", { data: { title: "Location", body: "We are in Salmiya" } })).status()).toBe(201);
    expect((await (await api.get("/api/saved-replies")).json()).replies.map((x) => x.title)).toContain("Location");
    // sales analytics counts real orders; Latte is the top item
    const an = await (await api.get("/api/orders/analytics?days=7")).json();
    expect(an.orders).toBeGreaterThanOrEqual(2);
    expect(an.topItems[0].name).toBe("Latte");
    expect((await r.json()).customerNotified).not.toBe("whatsapp"); // no WhatsApp connected: nothing claimed
    // pickup orders cannot go out for delivery
    expect((await api.patch(`/api/orders/${shared.orderId}`, { data: { status: "out_for_delivery" } })).status()).toBe(409);
    await page.goto("/dashboard/orders");
    await expect(page.getByText("Tunis").first()).toBeVisible();
    await page.getByRole("button", { name: /Delivery areas|مناطق التوصيل/ }).click();
    await expect(page.getByText("Salmiya").first()).toBeVisible();
  });

  test("website widget: locked to the business domain, visitor messages reach the inbox, staff replies reach the visitor", async ({ page, request }) => {
    await page.goto("/login");
    await page.fill("#email", A.email); await page.fill("#password", A.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/);
    const api = page.request;
    expect((await api.post("/api/widget/settings", { data: { domain: "not a domain" } })).status()).toBe(422);
    let r = await api.post("/api/widget/settings", { data: { domain: "https://www.e2e-cafe.example/menu", greeting_en: "Hi from E2E Cafe" } });
    expect(r.status()).toBe(200);
    const settings = await (await api.get("/api/widget/settings")).json();
    expect(settings.domain).toBe("e2e-cafe.example");
    expect(settings.status).toBe("pending"); // not "connected" until it really loads on that site
    expect(settings.snippetEn).toContain(`data-key="${settings.key}"`);

    // the chat page may only be framed by the business's domain
    r = await request.get(`/widget/${settings.key}?lang=en`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-security-policy"]).toContain("frame-ancestors https://e2e-cafe.example https://*.e2e-cafe.example");
    expect(r.headers()["x-frame-options"]).toBeUndefined();
    expect(await r.text()).toContain("Hi from E2E Cafe");
    expect((await request.get("/widget/wk_doesnotexist000000000000")).status()).toBe(404);
    // other app pages still refuse framing
    expect((await request.get("/login")).headers()["x-frame-options"]).toBe("DENY");

    // a visitor writes (no AI key in CI → the message is queued for staff, never a fake AI answer)
    const session = "e2e" + Date.now() + "abcdefgh";
    expect((await request.post(`/api/widget/${settings.key}`, { data: { session, text: "hi" }, headers: { "sec-fetch-site": "cross-site" } })).status()).toBe(403);
    r = await request.post(`/api/widget/${settings.key}`, { data: { session, text: "Do you have oat milk?", lang: "en" } });
    expect(r.status()).toBe(200);
    const sent = await r.json();
    expect(sent.reply).toBeNull();
    expect(sent.queued).toBe(true);
    const inbox = await (await api.get("/api/conversations?channel=web_chat")).json();
    const conv = inbox.conversations.find((c) => c.summary === "" || c.channel === "web_chat");
    expect(conv).toBeTruthy();
    expect(conv.unread).toBe(true);
    // staff replies from the inbox → visible in the widget
    expect((await api.post(`/api/so/live/${conv.id}`, { data: { action: "reply", text: "Yes, we do!" } })).status()).toBe(200);
    const polled = await (await request.get(`/api/widget/${settings.key}?session=${session}`)).json();
    expect(polled.messages.map((m) => `${m.role}:${m.content}`)).toEqual(["customer:Do you have oat milk?", "human:Yes, we do!"]);
    // another visitor's session sees nothing
    expect((await (await request.get(`/api/widget/${settings.key}?session=other${Date.now()}xxxxxxxx`)).json()).messages).toHaveLength(0);
    // delivery queue is readable and empty
    expect((await (await api.get("/api/deliveries")).json()).jobs).toHaveLength(0);

    // visitor rates the chat 👎 with a comment → visible in the inbox
    expect((await request.post(`/api/widget/${settings.key}/rate`, { data: { session, rating: 5 } })).status()).toBe(422);
    expect((await request.post(`/api/widget/${settings.key}/rate`, { data: { session, rating: -1, comment: "Too slow" } })).status()).toBe(200);
    const rated = (await (await api.get("/api/conversations?channel=web_chat")).json()).conversations.find((c) => c.id === conv.id);
    expect(rated.rating).toBe(-1);

    // weekly report is computed from real records (this business: 2 orders incl. the delivery one, ≥1 conversation, 1 rating 👎)
    const week = await (await api.get("/api/reports/weekly")).json();
    expect(week.orders).toBe(2);
    expect(week.conversations).toBeGreaterThanOrEqual(1);
    expect(week.ratingsDown).toBe(1);
    expect(week.satisfaction).toBe(0);
    expect((await api.post("/api/reports/weekly")).status()).toBe(200);

    // menu import: bulk add needs real prices; duplicates are skipped; photo reading needs the AI key (honest 503 in CI)
    expect((await api.post("/api/products/bulk", { data: { items: [{ name: "Mocha", price: null }] } })).status()).toBe(422);
    const bulk = await (await api.post("/api/products/bulk", { data: { items: [{ name: "Mocha", price: 1.75 }, { name: "Latte", price: 9 }] } })).json();
    expect(bulk).toEqual({ added: 1, skipped: 1 });
    const imp = await api.post("/api/products/import", { multipart: { file: { name: "menu.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") } } });
    expect(imp.status()).toBe(503);
  });

  test("app launch screen shows SO and opens the dashboard", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto("/app");
    await expect(page.getByRole("img", { name: /SO/ }).first()).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: "e2e-results/screens/app-splash.png" });
    await page.waitForURL(/\/(dashboard|login)/, { timeout: 10_000 }); // signed out → login
    await page.goto("/login");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: "e2e-results/screens/login-desktop.png" });
    await page.goto("/");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: "e2e-results/screens/landing-desktop.png" });
    await ctx.close();
  });

  test("dashboard pages fit a phone screen without horizontal scrolling", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.fill("#email", A.email);
    await page.fill("#password", A.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/);
    const problems = [];
    for (const locale of ["en", "ar"]) {
      // same name/domain/path as the cookie the app sets, so this replaces it instead of adding a second one
      await ctx.addCookies([{ name: "saut_locale", value: locale, domain: new URL(page.url()).hostname, path: "/", sameSite: "Lax" }]);
      for (const path of ["/dashboard", "/dashboard/conversations", "/dashboard/orders", "/dashboard/driver", "/dashboard/appointments", "/dashboard/knowledge", "/dashboard/customers", "/dashboard/settings"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const { overflow, dir } = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, dir: document.documentElement.dir }));
        if (locale === "ar" && dir !== "rtl") problems.push(`${path} [ar] is not right-to-left`);
        if (overflow > 1) problems.push(`${path} [${locale}] overflows by ${overflow}px`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
    await ctx.close();
  });

  test("Android app: email sign-up works and the Google button is hidden", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 SautAIApp/1.1" });
    const page = await ctx.newPage();
    await page.goto("/login");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.getByText(/Google/)).toHaveCount(0);
    const C = { email: `app.user.${stamp}@e2e.test`, password: "E2e-password-789", name: "App User", company: "App Co" };
    await signUpAndOnboard(page, C, `App Business ${stamp}`);
    // wrong password gives a clear message, not a raw error code
    await page.request.post("/auth/signout"); await ctx.clearCookies();
    await page.goto("/login");
    await page.fill("#email", C.email); await page.fill("#password", "nope-nope-1");
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator("form p[role=alert]")).toContainText(/Wrong email or password|غير صحيحة/);
    await ctx.close();
  });

  test("owner B deletes their account (business and login removed)", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.fill("#email", B.email); await page.fill("#password", B.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/);
    const plan = await (await page.request.get("/api/account")).json();
    expect(plan.delete).toHaveLength(1);
    expect(plan.block).toHaveLength(0);
    expect((await page.request.delete("/api/account", { data: { confirm: "nope" } })).status()).toBe(422);
    const r = await page.request.delete("/api/account", { data: { confirm: "DELETE" } });
    expect(r.status()).toBe(200);
    await ctx.clearCookies();
    await page.goto("/login");
    await page.fill("#email", B.email); await page.fill("#password", B.password);
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator("form p[role=alert]")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });
});
