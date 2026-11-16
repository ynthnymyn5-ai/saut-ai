/**
 * Android/iOS app shell helpers (pure). Run: `npx tsx --test scripts/test-native.ts`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assetLinks, backAction, classifyLink, deepLinkPath, hostMatches, IN_APP_HOSTS, isAppUserAgent } from "../src/lib/native-core";

const HOST = "www.sautai.company";

test("hostMatches: exact hosts and *.wildcards", () => {
  assert.ok(hostMatches("abc.supabase.co", IN_APP_HOSTS));
  assert.ok(hostMatches("WWW.SAUTAI.COMPANY", IN_APP_HOSTS));
  assert.ok(!hostMatches("supabase.co", IN_APP_HOSTS), "bare domain is not a subdomain");
  assert.ok(!hostMatches("evilsupabase.co", IN_APP_HOSTS));
  assert.ok(!hostMatches("sautai.company.evil.com", IN_APP_HOSTS));
});

test("IN_APP_HOSTS matches capacitor.config.json allowNavigation", () => {
  const cfg = JSON.parse(readFileSync(new URL("../mobile/capacitor.config.json", import.meta.url), "utf8"));
  assert.deepEqual([...IN_APP_HOSTS].sort(), [...cfg.server.allowNavigation].sort());
});

test("backAction: leaves the app on top-level screens, goes back or up elsewhere", () => {
  for (const p of ["/", "/app", "/dashboard", "/dashboard/", "/login"]) assert.deepEqual(backAction(p, true), { kind: "minimize" }, p);
  assert.deepEqual(backAction("/dashboard/orders", true), { kind: "history" });
  assert.deepEqual(backAction("/dashboard/orders", false), { kind: "navigate", to: "/dashboard" });
  assert.deepEqual(backAction("/admin/plans", false), { kind: "navigate", to: "/admin" });
  assert.deepEqual(backAction("/privacy", true), { kind: "history" });
  assert.deepEqual(backAction("/privacy", false), { kind: "minimize" });
});

test("classifyLink: own and allowed hosts stay in the app, other sites open a browser tab, schemes go to Android", () => {
  assert.equal(classifyLink("/dashboard/orders", HOST), "in-app");
  assert.equal(classifyLink("https://www.sautai.company/print/order/1", HOST), "in-app");
  assert.equal(classifyLink("https://checkout.stripe.com/c/pay/x", HOST), "in-app");
  assert.equal(classifyLink("https://demo.myfatoorah.com/x", HOST), "in-app");
  assert.equal(classifyLink("https://wa.me/96550000000?text=hi", HOST), "browser");
  assert.equal(classifyLink("https://maps.google.com/?q=1,2", HOST), "browser");
  assert.equal(classifyLink("mailto:a@b.co", HOST), "system");
  assert.equal(classifyLink("tel:+96550000000", HOST), "system");
  assert.equal(classifyLink("whatsapp://send?phone=1", HOST), "system");
  assert.equal(classifyLink("javascript:void(0)", HOST), "in-app");
  assert.equal(classifyLink("http://localhost:3000/x", "localhost:3000"), "in-app");
});

test("deepLinkPath: only https links on our own hosts", () => {
  assert.equal(deepLinkPath("https://www.sautai.company/auth/callback?token_hash=x&type=signup#y"), "/auth/callback?token_hash=x&type=signup#y");
  assert.equal(deepLinkPath("https://sautai.company/dashboard/orders"), "/dashboard/orders");
  assert.equal(deepLinkPath("http://www.sautai.company/dashboard"), null);
  assert.equal(deepLinkPath("https://evil.com/dashboard"), null);
  assert.equal(deepLinkPath("https://abc.supabase.co/auth"), null, "allowed in the WebView, but not ours");
  assert.equal(deepLinkPath("not a url"), null);
});

test("assetLinks: valid fingerprints only, normalised to upper case", () => {
  const fp = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0")).join(":");
  const out = assetLinks("com.sautai.app", ` ${fp}, junk ,AA:BB `) as { target: { package_name: string; sha256_cert_fingerprints: string[] } }[];
  assert.equal(out.length, 1);
  assert.equal(out[0].target.package_name, "com.sautai.app");
  assert.deepEqual(out[0].target.sha256_cert_fingerprints, [fp.toUpperCase()]);
  assert.deepEqual(assetLinks("com.sautai.app", ""), [], "nothing configured → empty list (valid JSON, no links verified)");
});

test("isAppUserAgent", () => {
  assert.ok(isAppUserAgent("Mozilla/5.0 (Linux; Android 14; wv) Chrome/130 Mobile Safari/537.36 SautAIApp/1.4"));
  assert.ok(!isAppUserAgent("Mozilla/5.0 (iPhone) Safari"));
});
