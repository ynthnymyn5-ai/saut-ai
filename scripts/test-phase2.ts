/**
 * Phase 2 unit tests (pure modules, no network or database).
 * Run: `npx tsx --test scripts/test-phase2.ts`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { signStreamToken, verifyStreamToken } from "../src/lib/so/stream-token";
import { inboundText, insideServiceWindow, splitWhatsAppText, WA_MAX_TEXT } from "../src/lib/messaging/wa-core";
import { fromMinor, minorUnitDigits, toMinor } from "../src/lib/payments/money";
import { docxToText, readZipEntry } from "../src/lib/knowledge/extract";
import { buildSentryEnvelope, parseSentryDsn } from "../src/lib/monitoring";

const IDS = { c: "11111111-1111-4111-8111-111111111111", e: "22222222-2222-4222-8222-222222222222", o: "33333333-3333-4333-8333-333333333333" };

// ── Voice stream tokens ───────────────────────────────────────────────────
test("stream token: round-trips claims and expires", () => {
  const now = Date.UTC(2026, 10, 1, 9, 0, 0);
  const t = signStreamToken("s3cret", IDS, 120, now);
  assert.deepEqual({ ...verifyStreamToken("s3cret", t, now + 1000)!, exp: 0 }, { ...IDS, exp: 0 });
  assert.equal(verifyStreamToken("s3cret", t, now + 121_000), null, "expired after ttl");
});
test("stream token: rejects wrong secret, tampering and junk", () => {
  const t = signStreamToken("s3cret", IDS);
  assert.equal(verifyStreamToken("other", t), null);
  const [body, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ ...IDS, o: "44444444-4444-4444-8444-444444444444", exp: 9999999999 })).toString("base64url");
  assert.equal(verifyStreamToken("s3cret", `${forged}.${sig}`), null, "claims swapped");
  assert.equal(verifyStreamToken("s3cret", `${body}.${sig.slice(0, -2)}xx`), null, "signature altered");
  for (const bad of ["", "abc", "a.b.c", ".", `${body}.`]) assert.equal(verifyStreamToken("s3cret", bad), null, bad);
  assert.equal(verifyStreamToken("", t), null, "no secret configured → nothing verifies");
  assert.throws(() => signStreamToken("", IDS));
});
test("stream token: bridge verifier is byte-compatible with the app signer", async () => {
  Object.assign(process.env, { NODE_ENV: "test" }); // bridge module must not start listening on import
  const prev = { ...process.env };
  Object.assign(process.env, { OPENAI_API_KEY: "x", APP_URL: "http://x", INTERNAL_API_SECRET: "s3cret" });
  try {
    const bridge = await import("../services/voice-bridge/server.mjs").catch(() => null);
    if (!bridge) return; // ws not installed in this environment → covered by scripts/test-bridge.mjs
    const t = signStreamToken("s3cret", IDS);
    assert.equal(bridge.verifyStreamToken("s3cret", t)?.o, IDS.o);
    assert.equal(bridge.verifyStreamToken("nope", t), null);
  } finally { process.env = prev; }
});

// ── WhatsApp ─────────────────────────────────────────────────────────────
test("whatsapp: short replies are sent as one message", () => {
  assert.deepEqual(splitWhatsAppText("  أهلاً وسهلاً  "), ["أهلاً وسهلاً"]);
});
test("whatsapp: long replies split under the limit at natural breaks, losing nothing", () => {
  const para = "هذه جملة عن قائمة الطعام والأسعار. ".repeat(60);
  const text = `${para}\n\n${para}\n\n${para}`;
  const parts = splitWhatsAppText(text, 1000);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 1000 && p.length > 0));
  assert.equal(parts.join(" ").replace(/\s+/g, " "), text.replace(/\s+/g, " ").trim());
  assert.ok(parts.slice(0, -1).every((p) => /[.\n]$/.test(p) || p.endsWith(".")), "cuts on sentence ends");
  const noSpaces = "x".repeat(WA_MAX_TEXT * 2 + 5);
  assert.deepEqual(splitWhatsAppText(noSpaces).map((p) => p.length), [WA_MAX_TEXT, WA_MAX_TEXT, 5]);
});
test("whatsapp: 24-hour customer-service window", () => {
  const now = Date.UTC(2026, 10, 1, 12);
  assert.equal(insideServiceWindow(new Date(now - 23 * 3600e3).toISOString(), now), true);
  assert.equal(insideServiceWindow(new Date(now - 25 * 3600e3).toISOString(), now), false);
  assert.equal(insideServiceWindow(null, now), false);
  assert.equal(insideServiceWindow("not a date", now), false);
  assert.equal(insideServiceWindow(new Date(now + 3 * 3600e3).toISOString(), now), false, "future timestamps are not trusted");
});
test("whatsapp: inbound message types become readable text or a staff note", () => {
  assert.equal(inboundText({ id: "1", from: "965", type: "text", text: { body: "مرحبا" } }).text, "مرحبا");
  assert.equal(inboundText({ id: "1", from: "965", type: "interactive", interactive: { button_reply: { title: "تأكيد" } } }).text, "تأكيد");
  const voice = inboundText({ id: "1", from: "965", type: "audio", audio: { id: "MEDIA1", voice: true } });
  assert.equal(voice.text, null); assert.equal(voice.needsTranscription, "MEDIA1");
  assert.equal(inboundText({ id: "1", from: "965", type: "image", image: { id: "m", caption: "هذا المنتج متوفر؟" } }).text, "هذا المنتج متوفر؟");
  const sticker = inboundText({ id: "1", from: "965", type: "sticker" });
  assert.equal(sticker.text, null); assert.equal(sticker.note, "[sticker message]");
  assert.match(inboundText({ id: "1", from: "965", type: "location", location: { latitude: 29.37, longitude: 47.97, name: "Salmiya" } }).text!, /Salmiya/);
});

// ── Money ───────────────────────────────────────────────────────────────
test("money: Kuwaiti dinar uses fils (3 decimals) — Stripe amounts are not divided by 100", () => {
  assert.equal(minorUnitDigits("kwd"), 3);
  assert.equal(fromMinor(49000, "KWD"), 49);      // was 490 with the old /100
  assert.equal(fromMinor(19500, "kwd"), 19.5);
  assert.equal(fromMinor(4900, "USD"), 49);
  assert.equal(fromMinor(500, "JPY"), 500);
  assert.equal(toMinor(49, "KWD"), 49000);
  assert.equal(toMinor(12.345, "KWD"), 12350, "Stripe needs 3-decimal amounts rounded to 10 fils");
  assert.equal(toMinor(19.99, "USD"), 1999);
  for (const v of [0.5, 19, 49, 99, 990, 123.45]) assert.equal(fromMinor(toMinor(v, "BHD"), "BHD"), Math.round(v * 100) / 100);
});

// ── Knowledge extraction ────────────────────────────────────────────────
function zip(files: Record<string, string>, method: 0 | 8 = 8): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content); const data = method === 8 ? zlib.deflateRawSync(raw) : raw; const nm = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nm, data); centrals.push(ch, nm); offset += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(centrals); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
const DOC = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
<w:p><w:r><w:t>قائمة الأسعار</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">قهوة عربية </w:t></w:r><w:r><w:tab/><w:t>1.250 د.ك</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Latte</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1.750 KWD</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:r><w:t>Parking &amp; delivery &lt;free&gt; &#1605;</w:t></w:r></w:p></w:body></w:document>`;
test("docx: extracts Arabic and English text, tabs, tables and entities", () => {
  const text = docxToText(zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": DOC }));
  assert.match(text, /^قائمة الأسعار\n/);
  assert.match(text, /قهوة عربية \t1\.250 د\.ك/);
  assert.match(text, /Latte/); assert.match(text, /1\.750 KWD/);
  assert.match(text, /Parking & delivery <free> م/);
  assert.doesNotMatch(text, /<w:|<\/w:|<\?xml/);
});
test("docx: stored (uncompressed) entries and invalid files", () => {
  assert.match(docxToText(zip({ "word/document.xml": DOC }, 0)), /Latte/);
  assert.equal(readZipEntry(zip({ "a.txt": "x" }), "word/document.xml"), null);
  assert.throws(() => docxToText(zip({ "a.txt": "x" })), /Not a valid Word document/);
  assert.equal(readZipEntry(Buffer.from("%PDF-1.7 not a zip at all, definitely not"), "word/document.xml"), null);
});

// ── Error monitoring ────────────────────────────────────────────────────
test("sentry: DSN parsing", () => {
  assert.deepEqual(parseSentryDsn("https://abc123@o42.ingest.sentry.io/4507"), { url: "https://o42.ingest.sentry.io/api/4507/envelope/", auth: "Sentry sentry_version=7, sentry_key=abc123, sentry_client=saut-ai/1.0" });
  assert.equal(parseSentryDsn("https://abc@self.hosted/sentry/12")?.url, "https://self.hosted/sentry/api/12/envelope/");
  for (const bad of ["", "not a url", "https://o.ingest.sentry.io/1", "https://k@o.ingest.sentry.io/abc"]) assert.equal(parseSentryDsn(bad), null, bad);
});
test("sentry: envelope carries the error and only safe tags (no personal data)", () => {
  const e = new Error("WhatsApp media lookup failed");
  const env = buildSentryEnvelope(e, { scope: "whatsapp-voice-note", phone: "+96550000000", text: "secret message", doc: "abc" }, { dsn: "https://k@o.ingest.sentry.io/1", environment: "production" }, new Date("2026-11-01T09:00:00Z"));
  const [h, item, payload] = env.split("\n");
  assert.equal(JSON.parse(h).sent_at, "2026-11-01T09:00:00.000Z");
  const ev = JSON.parse(payload);
  assert.equal(JSON.parse(item).length, Buffer.byteLength(payload));
  assert.equal(ev.exception.values[0].value, "WhatsApp media lookup failed");
  assert.deepEqual(ev.tags, { scope: "whatsapp-voice-note", doc: "abc" });
  assert.doesNotMatch(env, /96550000000|secret message/);
});

// ── In-app assistant ────────────────────────────────────────────────────
import { ASSISTANT_PAGES, asEmotion, detectNavigation, pcmLevel, resamplePcm16, speakable, voiceDirection } from "../src/lib/assistant/core";

function sine(rate: number, seconds: number, hz = 220, amp = 0.5) {
  const n = Math.round(rate * seconds); const b = new Uint8Array(n * 2); const v = new DataView(b.buffer);
  for (let i = 0; i < n; i++) v.setInt16(i * 2, Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * amp * 32767), true);
  return b;
}
test("assistant audio: 24 kHz TTS → 16 kHz for the face keeps duration and waveform", () => {
  const src = sine(24000, 1);
  const out = resamplePcm16(src, 24000, 16000);
  assert.equal(out.byteLength, 16000 * 2, "1 s in → 1 s out");
  const ref = sine(16000, 1);
  const a = new DataView(out.buffer), b = new DataView(ref.buffer);
  let maxErr = 0; for (let i = 0; i < 16000; i++) maxErr = Math.max(maxErr, Math.abs(a.getInt16(i * 2, true) - b.getInt16(i * 2, true)));
  assert.ok(maxErr < 400, `waveform preserved (max error ${maxErr}/32767)`);
  assert.equal(resamplePcm16(new Uint8Array(7), 24000, 16000).byteLength % 2, 0, "odd byte counts are safe");
  assert.deepEqual(resamplePcm16(src, 16000, 16000), src);
});
test("assistant audio: speech level drives the mouth (silence closed, speech open)", () => {
  assert.equal(pcmLevel(new Uint8Array(3200)), 0);
  assert.ok(pcmLevel(sine(16000, 0.1, 200, 0.3)) > 0.5);
  assert.ok(pcmLevel(sine(16000, 0.1, 200, 0.02)) < pcmLevel(sine(16000, 0.1, 200, 0.2)));
});
test("assistant: voice navigation in Gulf Arabic and English, questions are not hijacked", () => {
  const cases: [string, string | null][] = [
    ["افتح المواعيد", "appointments"], ["لو سمحت ودني للفوترة", "billing"], ["روح المحادثات", "conversations"],
    ["افتح الإعدادات", "settings"], ["اعرض العملاء", "customers"], ["أنشئ موظف جديد", "create_employee"], ["افتح موظف جديد", "create_employee"],
    ["open appointments", "appointments"], ["take me to billing", "billing"], ["show me the pipeline", "pipeline"], ["Open live", "live"],
    ["كم موعد عندي اليوم؟", null], ["how many calls this month", null], ["المواعيد", null], ["افتح الباب", null], ["يا سو افتح المواعيد", "appointments"], ["سو كم مكالمة اليوم؟", null],
  ];
  for (const [text, page] of cases) assert.equal(detectNavigation(text), page, text);
  for (const href of Object.values(ASSISTANT_PAGES)) assert.match(href, /^\/dashboard(\/[a-z/-]+)?$/);
});
test("assistant: emotions, voice tone and speakable text", () => {
  assert.equal(asEmotion("happy"), "happy"); assert.equal(asEmotion("angry"), "neutral"); assert.equal(asEmotion(undefined), "neutral");
  assert.match(voiceDirection("concerned", "ar"), /Kuwaiti/); assert.match(voiceDirection("concerned", "ar"), /reassuring/);
  assert.match(voiceDirection("celebrating", "en"), /delighted/);
  assert.equal(speakable("**تم** ✅ حجز الموعد! شوف https://x.y/z"), "تم حجز الموعد! شوف");
  assert.equal(speakable("a".repeat(2000)).length, 900);
});

import { elevenVoiceSettings, speechLanguage } from "../src/lib/assistant/core";
test("voice: Arabic or English voice is chosen from the reply text", () => {
  assert.equal(speechLanguage("هلا والله! عندك ٣ مواعيد اليوم.", "en"), "ar");
  assert.equal(speechLanguage("You have 3 appointments today.", "ar"), "en");
  assert.equal(speechLanguage("تم حجز موعدك عند Dr. Ahmed الساعة 5", "en"), "ar", "mostly Arabic with a name");
  assert.equal(speechLanguage("Your booking is confirmed — شكراً", "ar"), "en", "mostly English");
  assert.equal(speechLanguage("123 !!", "ar"), "ar", "no letters → UI language");
});
test("voice: emotion changes expressiveness within safe ranges", () => {
  for (const e of ["neutral", "happy", "thinking", "concerned", "celebrating"] as const) {
    const s = elevenVoiceSettings(e);
    assert.ok(s.stability >= 0 && s.stability <= 1 && s.style >= 0 && s.style <= 1 && s.speed >= 0.7 && s.speed <= 1.2, e);
  }
  assert.ok(elevenVoiceSettings("celebrating").stability < elevenVoiceSettings("concerned").stability, "celebrating is more expressive");
});

import { resolveVoice, shapeVoices } from "../src/lib/assistant/voices";
test("voices: employee choice beats business default beats server default", () => {
  const emp = { voice_ar: "EmpArabicVoice01" }, biz = { voice_ar: "BizArabicVoice01", voice_en: "BizEnglishVoice1" }, env = { voice_ar: "EnvArabicVoice01", voice_en: "EnvEnglishVoice1" };
  assert.equal(resolveVoice("ar", [emp, biz, env]), "EmpArabicVoice01");
  assert.equal(resolveVoice("en", [emp, biz, env]), "BizEnglishVoice1", "employee has no English voice → business");
  assert.equal(resolveVoice("en", [null, {}, env]), "EnvEnglishVoice1");
  assert.equal(resolveVoice("ar", [{ voice_ar: "bad id!" }, { voice_ar: "../etc/passwd" }]), null, "invalid IDs are ignored");
  assert.equal(resolveVoice("ar", []), null);
});
test("voices: ElevenLabs list is shaped safely; Arabic voices recognised", () => {
  const out = shapeVoices({ voices: [
    { voice_id: "A9ATTqUUQ6GHu0coCz8t", name: "Abu Salem - Professional", preview_url: "https://storage.googleapis.com/x.mp3", labels: { gender: "male", accent: "gulf" } },
    { voice_id: "G1QUjBCuRBbLbAmYlTgl", name: "Jessica", preview_url: "javascript:alert(1)", labels: { gender: "female", language: "en" } },
    { voice_id: "Xx", name: "too short id" },
    { name: "no id" },
  ] });
  assert.equal(out.length, 2);
  assert.equal(out[0].arabic, true); assert.equal(out[1].arabic, false);
  assert.equal(out[1].preview, null, "non-https preview URLs are dropped");
  assert.deepEqual(shapeVoices(null), []);
});

import { businessExample, fillEmpty } from "../src/lib/business-examples";
test("wizard examples: every placeholder is bracketed and only empty fields are filled", () => {
  for (const loc of ["ar", "en"] as const) for (const ind of ["restaurant", "clinic", "beauty_salon", "hotel", "other"]) {
    const ex = businessExample(ind, loc);
    assert.ok(ex.description && ex.hours && ex.faqs, `${loc}/${ind}`);
    assert.match(ex.description, /\[[^\]]+\]/, "description has placeholders to replace");
  }
  const cur = { businessName: "لوكيشن كافي", description: "", address: "السالمية", hours: "  ", faqs: "س: عندي سؤال" };
  const out = fillEmpty(cur, businessExample("restaurant", "ar"));
  assert.equal(out.businessName, "لوكيشن كافي"); assert.equal(out.address, "السالمية"); assert.equal(out.faqs, "س: عندي سؤال", "owner text is never overwritten");
  assert.match(out.description, /مقهى/); assert.match(out.hours, /يومياً/);
});
test("assistant: “اربط واتساب” opens the WhatsApp guide", () => {
  assert.equal(detectNavigation("اربط واتساب"), "whatsapp_setup");
  assert.equal(detectNavigation("connect whatsapp"), "whatsapp_setup");
  assert.equal(detectNavigation("افتح التكاملات"), "integrations");
});

import { maskSecrets, ProviderRequestError } from "../src/lib/env";
test("provider errors: real reason shown, secrets masked", () => {
  const e = new ProviderRequestError("OpenAI", 401, "Incorrect API key provided: sk-proj-abcdefghijklmnop1234. You can find your API key at …");
  assert.match(e.message, /Incorrect API key provided/);
  assert.doesNotMatch(e.message, /abcdefghijklmnop1234/);
  assert.doesNotMatch(maskSecrets("token EAAGm0PX4ZCpsBAKZCZBz9 expired"), /EAAGm0PX4ZCpsBAKZCZBz9/);
  assert.doesNotMatch(maskSecrets("key sb_secret_9hF0abcdefgh"), /9hF0abcdefgh/);
  assert.equal(maskSecrets("You exceeded your current quota"), "You exceeded your current quota");
});

import { checkSlot } from "../src/lib/so/availability";
test("bookings: outside opening hours and over-capacity are refused", () => {
  const hours = { thu: [["16:00", "23:00"]] as [string, string][], fri: [["16:00", "02:00"]] as [string, string][] };
  const at = (iso: string) => new Date(iso);
  // 2026-11-05 is a Thursday. Kuwait = UTC+3.
  assert.deepEqual(checkSlot({ startsAt: at("2026-11-05T17:00:00+03:00"), durationMin: 60, hours, busy: [] }), { ok: true });
  assert.deepEqual(checkSlot({ startsAt: at("2026-11-05T10:00:00+03:00"), durationMin: 60, hours, busy: [] }), { ok: false, reason: "outside_hours" });
  assert.deepEqual(checkSlot({ startsAt: at("2026-11-05T22:30:00+03:00"), durationMin: 60, hours, busy: [] }), { ok: false, reason: "outside_hours" }, "must end before closing");
  assert.deepEqual(checkSlot({ startsAt: at("2026-11-06T23:30:00+03:00"), durationMin: 60, hours, busy: [] }), { ok: true }, "overnight hours (Fri until 2 AM)");
  assert.deepEqual(checkSlot({ startsAt: at("2026-11-04T17:00:00+03:00"), durationMin: 30, hours, busy: [] }), { ok: false, reason: "outside_hours" }, "closed on Wednesday");
  const busy = [{ starts_at: "2026-11-05T17:00:00+03:00", ends_at: "2026-11-05T18:00:00+03:00" }];
  assert.deepEqual(checkSlot({ startsAt: at("2026-11-05T17:30:00+03:00"), durationMin: 30, hours, busy }), { ok: false, reason: "full" }, "capacity 1 → overlap refused");
  assert.deepEqual(checkSlot({ startsAt: at("2026-11-05T17:30:00+03:00"), durationMin: 30, hours, busy, capacity: 3 }), { ok: true }, "capacity 3 → allowed");
  assert.deepEqual(checkSlot({ startsAt: at("2026-11-05T18:00:00+03:00"), durationMin: 30, hours, busy }), { ok: true }, "back-to-back is fine");
  assert.deepEqual(checkSlot({ startsAt: at("2026-11-05T12:00:00+03:00"), durationMin: 30, hours: {}, busy: [] }), { ok: true }, "no hours set → 09:00–21:00 default");
});

// ── Orders ────────────────────────────────────────────────────────────────
import { canMove, orderErrorMessage } from "../src/lib/orders";
import { formatMoney } from "../src/lib/payments/money";
test("orders: only forward status moves; delivered/canceled are final", () => {
  assert.ok(canMove("pending", "confirmed") && canMove("confirmed", "preparing") && canMove("ready", "delivered"));
  assert.ok(canMove("pending", "canceled") && canMove("ready", "canceled"));
  assert.ok(!canMove("delivered", "canceled") && !canMove("canceled", "pending") && !canMove("pending", "delivered") && !canMove("bogus", "confirmed"));
});
test("orders: database errors become readable messages; unknown errors stay hidden", () => {
  assert.match(orderErrorMessage("Product not available")!, /no longer available/);
  assert.match(orderErrorMessage("Invalid quantity")!, /1 and 999/);
  assert.equal(orderErrorMessage("permission denied for table orders"), null);
});
test("money: KWD shows three decimals", () => {
  assert.match(formatMoney(3.75, "KWD", "en"), /3\.750/);
  assert.match(formatMoney(10, "USD", "en"), /10\.00/);
});

// ── Auth errors (sign-up / login on web and in the Android app) ──────────
import { authErrorMessage, classifyAuthError, isInApp, isObfuscatedExistingUser } from "../src/lib/auth-errors";
test("auth: Supabase errors map to clear messages in both languages", () => {
  assert.equal(classifyAuthError({ message: "Invalid login credentials" }), "invalid_credentials");
  assert.equal(classifyAuthError({ message: "Email not confirmed" }), "email_not_confirmed");
  assert.equal(classifyAuthError({ message: "User already registered" }), "already_registered");
  assert.equal(classifyAuthError({ message: "email rate limit exceeded", status: 429 }), "rate_limited");
  assert.equal(classifyAuthError({ code: "over_email_send_rate_limit", message: "" }), "rate_limited");
  assert.equal(classifyAuthError({ message: "For security purposes, you can only request this after 42 seconds." }), "rate_limited");
  assert.equal(classifyAuthError({ message: "Password should be at least 8 characters." }), "weak_password");
  assert.equal(classifyAuthError({ message: "Token has expired or is invalid" }), "otp_invalid");
  assert.equal(classifyAuthError({ message: "Failed to fetch" }), "network");
  assert.equal(classifyAuthError({ message: "Signups not allowed for this instance" }), "signups_disabled");
  assert.match(authErrorMessage({ message: "Invalid login credentials" }, "ar"), /غير صحيحة/);
  assert.equal(authErrorMessage({ message: "Some new provider error" }, "en"), "Some new provider error", "unknown errors are not hidden");
});
test("auth: existing account detection and in-app detection", () => {
  assert.ok(isObfuscatedExistingUser({ identities: [] }));
  assert.ok(!isObfuscatedExistingUser({ identities: [{}] }));
  assert.ok(!isObfuscatedExistingUser(null));
  assert.ok(isInApp("Mozilla/5.0 (Linux; Android 14; wv) Chrome/130 Mobile Safari/537.36 SautAIApp/1.1"));
  assert.ok(!isInApp("Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36"));
});
