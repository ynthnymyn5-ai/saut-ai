/**
 * Product screenshots for listings and marketing. Runs only in the `screenshots` workflow
 * against a LOCAL Supabase stack with clearly sample data (never production).
 */
import { test, expect } from "@playwright/test";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUT = "e2e-results/screens";
const stamp = Date.now();
const U = { email: `owner.${stamp}@sample.test`, password: "Sample-password-123", name: "Mohammad", company: "Qahwa House" };

async function rest(path, method = "GET", body) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];

test.describe.serial("screenshots", () => {
  const ctx = {};

  test("seed a sample café", async ({ page }) => {
    await page.goto("/signup");
    await page.fill("#fullName", U.name);
    await page.fill("#company", U.company);
    await page.fill("#email", U.email);
    await page.fill("#password", U.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/onboarding/);
    await page.fill("#ob-name", U.company);
    await page.locator('form button[type="submit"]').click();
    await page.locator('button[role="radio"]').first().click();
    await page.locator('form button[type="submit"]').click();
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/);

    const [org] = await rest(`organizations?select=id&name=eq.${encodeURIComponent(U.company)}`);
    const orgId = org.id;
    const P = [["Spanish Latte", 1.75], ["Karak Tea", 0.5], ["Flat White", 1.5], ["Saffron Cake", 2.25], ["Cheese Croissant", 1], ["Iced Matcha", 1.75], ["Date Cookies", 0.75], ["Cold Brew", 1.5]];
    const products = await rest("products", "POST", P.map(([name, price]) => ({ organization_id: orgId, name, price })));
    const names = ["Fatima Al-Sabah", "Noura Al-Mutairi", "Abdullah Al-Ajmi", "Sara Al-Enezi", "Yousef Al-Kandari", "Maryam Al-Rashidi", "Khalid Al-Azmi", "Dana Al-Shammari", "Hamad Al-Otaibi", "Reem Al-Hajri", "Faisal Al-Dosari", "Lulwa Al-Saleh"];
    const customers = await rest("customers", "POST", names.map((full_name, i) => ({ organization_id: orgId, full_name, phone: `+9655000${String(1100 + i)}` })));
    const zones = await rest("delivery_zones", "POST", [["Salmiya", 1], ["Hawally", 0.75], ["Kuwait City", 1.5]].map(([name, fee]) => ({ organization_id: orgId, name, fee, min_order: 2 })));
    await rest("ai_employees", "POST", { organization_id: orgId, name: "Sara", industry: "restaurant", dialect: "kuwaiti", status: "active", activated_at: new Date().toISOString(), tasks: ["answer_faq", "take_orders"] });

    const orders = [], items = [];
    const now = Date.now();
    for (let n = 0; n < 64; n++) {
      const daysAgo = n < 6 ? 0 : Math.floor(rnd() * 21);
      const hour = 7 + Math.floor(rnd() * 15);
      const t = new Date(now - daysAgo * 86400000);
      t.setUTCHours(hour - 3, Math.floor(rnd() * 60), 0, 0);
      if (t.getTime() > now) t.setTime(now - (n + 1) * 600000);
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => { const p = pick(products); const q = 1 + Math.floor(rnd() * 3); return { p, q }; });
      const subtotal = lines.reduce((s, l) => s + Number(l.p.price) * l.q, 0);
      const delivery = rnd() < 0.55, zone = delivery ? pick(zones) : null;
      const status = daysAgo === 0 ? ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "delivered"][n % 6] : rnd() < 0.07 ? "canceled" : "delivered";
      orders.push({
        organization_id: orgId, order_no: 1001 + n, customer_id: rnd() < 0.9 ? pick(customers).id : null, status,
        fulfillment: delivery ? "delivery" : "pickup", subtotal: subtotal.toFixed(3), delivery_fee: zone ? zone.fee : 0,
        total: (subtotal + (zone ? Number(zone.fee) : 0)).toFixed(3), delivery_zone_id: zone?.id ?? null,
        delivery_address: zone ? { area: zone.name, block: String(1 + Math.floor(rnd() * 12)), street: String(1 + Math.floor(rnd() * 40)), house: String(1 + Math.floor(rnd() * 90)) } : null,
        created_at: t.toISOString(), updated_at: t.toISOString(),
      });
      items.push(lines);
    }
    const saved = await rest("orders", "POST", orders);
    saved.sort((a, b) => a.order_no - b.order_no);
    await rest("order_items", "POST", saved.flatMap((o, i) => items[i].map(({ p, q }) => ({ order_id: o.id, organization_id: orgId, product_id: p.id, name: p.name, unit_price: p.price, quantity: q, line_total: (Number(p.price) * q).toFixed(3) }))));
    ctx.token = saved.find((o) => o.status === "out_for_delivery")?.tracking_token;

    const api = page.request;
    const d = new Date(Date.now() + 86400000);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(d);
    for (const [i, h] of ["10:00", "12:30", "17:00"].entries()) await api.post("/api/appointments", { data: { customer_name: names[i], phone: customers[i].phone, starts_at: `${day}T${h}:00+03:00`, duration_min: 30 } });

    const w = await api.post("/api/widget/settings", { data: { domain: "https://www.qahwahouse.example", greeting_en: "Hi! How can we help?" } });
    const key = (await w.json()).key;
    for (const [s, text] of [["sessionaaaaaaaaaaaaaaaaa1", "Do you deliver to Salmiya?"], ["sessionbbbbbbbbbbbbbbbbb2", "What time do you close today?"], ["sessionccccccccccccccccc3", "عندكم حليب شوفان؟"]]) {
      await page.request.post(`/api/widget/${key}`, { data: { session: s, text, lang: text.match(/[a-z]/i) ? "en" : "ar" }, headers: { origin: "https://www.qahwahouse.example", "sec-fetch-site": "same-origin" } });
    }
    expect(saved.length).toBe(64);
  });

  for (const locale of ["en", "ar"]) {
    test(`desktop screens (${locale})`, async ({ browser }) => {
      const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
      const page = await c.newPage();
      await page.goto("/login");
      await c.addCookies([{ name: "saut_locale", value: locale, domain: new URL(page.url()).hostname, path: "/", sameSite: "Lax" }]);
      await page.goto("/login");
      await page.fill("#email", U.email);
      await page.fill("#password", U.password);
      await page.locator('form button[type="submit"]').click();
      await page.waitForURL(/\/dashboard/);
      const shots = [["01-landing", "/"], ["02-overview", "/dashboard"], ["03-orders", "/dashboard/orders"], ["04-inbox", "/dashboard/conversations"], ["05-analyst", "/dashboard/analyst"], ["06-employees", "/dashboard/employees"], ["07-customers", "/dashboard/customers"], ["08-appointments", "/dashboard/appointments"], ["09-knowledge", "/dashboard/knowledge"], ["10-integrations", "/dashboard/integrations"]];
      for (const [name, path] of shots) {
        try {
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(1200);
          await page.screenshot({ path: `${OUT}/desktop-${locale}-${name}.png` });
        } catch (e) { console.log(`skip ${name}: ${e.message}`); }
      }
      await c.close();
    });

    test(`phone screens (${locale})`, async ({ browser }) => {
      const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      const page = await c.newPage();
      await page.goto("/login");
      await c.addCookies([{ name: "saut_locale", value: locale, domain: new URL(page.url()).hostname, path: "/", sameSite: "Lax" }]);
      await page.goto("/login");
      await page.fill("#email", U.email);
      await page.fill("#password", U.password);
      await page.locator('form button[type="submit"]').click();
      await page.waitForURL(/\/dashboard/);
      const shots = [["01-overview", "/dashboard"], ["02-orders", "/dashboard/orders"], ["03-inbox", "/dashboard/conversations"], ["04-analyst", "/dashboard/analyst"]];
      if (ctx.token) shots.push(["05-tracking", `/t/${ctx.token}`]);
      for (const [name, path] of shots) {
        try {
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(1200);
          await page.screenshot({ path: `${OUT}/phone-${locale}-${name}.png` });
        } catch (e) { console.log(`skip ${name}: ${e.message}`); }
      }
      await c.close();
    });
  }
});
