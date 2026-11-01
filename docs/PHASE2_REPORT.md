# SAUT AI — Phase 2 report: live channels, payments, launch readiness

Date: 1 Nov 2026. Status: **implemented; unit, integration and database tests pass; app build pending** (see §8).
Nothing from Phase 1 or the OS upgrade was removed; every change is additive or a bug fix.

## 1. Live phone calls
| Before | Phase 2 |
|---|---|
| Call data sent as a query string on the Twilio `<Stream>` URL — **Twilio drops query strings**, so the bridge never knew the conversation | Data sent as `<Parameter>`s, including a **signed 2-minute stream token** (`src/lib/so/stream-token.ts`) |
| Anyone who found the bridge URL could open paid OpenAI sessions | Bridge verifies the token before opening OpenAI; forged/expired tokens are dropped (tested) |
| Bridge held the Supabase **service-role key** | Bridge holds no database key; uses `/api/internal/session`, `/call-event`, `/tool`, `/status` (shared secret, org-scoped) |
| Bridge used the raw instructions and **empty tool schemas** | Same prompt builder and guarded tool list as chat (`buildAgentPrompt` + agent's assigned tools, real JSON schemas); known callers get their memory |
| "Transfer to human" only flagged the conversation; the caller stayed with the AI | Live call is **redirected via Twilio REST** to the agent's transfer number after the AI says "transferring you"; reported transferred only when Twilio accepts; if it fails the AI is told and takes a message |
| No packaging | `package.json`, `Dockerfile`, `fly.toml`, `/health`, graceful shutdown, max call duration, structured logs |

## 2. WhatsApp
- Routing by `phone_number_id` (stored on connect), then display number.
- Read receipt + typing indicator while the AI replies.
- **Voice notes transcribed** (OpenAI STT) and answered; captions used for images/documents; locations understood; anything unreadable goes to staff with a notification.
- Replies over 4,096 characters split at sentence boundaries.
- Manual sends outside the 24-hour window are refused up front with `template_required` instead of failing at Meta.

## 3. Payments & subscriptions
| Issue | Fix |
|---|---|
| **Stripe amounts in KWD divided by 100** — a 49 KWD invoice was recorded as 490 KWD | `src/lib/payments/money.ts` (fils = 3 decimals); used by the webhook and add-on checkout |
| Cancelling a MyFatoorah plan never stopped the recurring charge | `RecurringId` stored from `GetPaymentStatus`; cancel calls `CancelRecurringPayment` first and changes nothing if MyFatoorah doesn't confirm |
| MyFatoorah plans and free trials never expired | `expire_lapsed_subscriptions()` (migration 0009, hourly via pg_cron): trial ended → closed; unpaid renewal → past due after 3 days → cancelled after 10; owners notified; audited; Stripe untouched |
| Billing page showed "no subscription" when a pending checkout existed alongside the live plan | Loader prefers the live subscription |
| `stripePortal()` existed but nothing used it | `POST /api/billing/portal` + **Payment method & invoices** button |
| — | Past-due banner with *Pay now* / *Update payment method*; receipt links in billing history |

## 4. Launch readiness
- **Rate limits shared** across instances with Upstash Redis REST (falls back to in-memory); `Retry-After` header.
- **Sentry** without an SDK (envelope API); only safe tags are sent — tested that phone numbers and message text are not.
- **Knowledge files actually read:** DOCX parsed in-process (dependency-free ZIP reader with zip-bomb guard); PDFs read by OpenAI after the response (`after()`); status *Reading… → Ready / Couldn't read + reason*; dashboard refreshes automatically. Full-text index matching the knowledge search query.
- **CSP** shipped as Report-Only (switch to enforcing after one clean release).
- `/api/health` now reports `ops.sharedRateLimit`, `ops.errorMonitoring`, `ops.voiceBridge`.
- Middleware skips static, PWA and server-to-server routes (less latency per request).

## 5. Design: installable phone app
- Web app manifest (Arabic first, shortcuts to Live, Conversations, Appointments), PNG + maskable + Apple icons rendered from the brand mark.
- Service worker: caches only the app shell and a bilingual offline page — never API or business data.
- **Install app** button in the dashboard header (Android/desktop); iPhone via *Add to Home Screen*.
- Phone **tab bar** (Overview, Live, Conversations, Appointments, More) with safe-area padding.

## 6. Database (migration 0009, additive, re-runnable)
`subscriptions.provider_recurring_id`, `expire_lapsed_subscriptions()` (security definer, not executable by anon), `knowledge_documents.error`, FTS + processing indexes.

## 7. Tests performed
| Suite | Command | Result |
|---|---|---|
| Engine units (Phase OS) | `npm test` | 14 / 14 ✅ |
| Phase 2 units: stream token (incl. bridge ↔ app compatibility), WhatsApp split/window/types, KWD money, DOCX extraction, Sentry DSN + privacy | `npm test` | 12 / 12 ✅ |
| **Voice bridge integration** — real bridge process vs mock app + mock OpenAI Realtime: session, greeting audio, transcripts, guarded tool call, barge-in, live transfer after the AI speaks; forged/expired tokens rejected before any OpenAI session | `npm run test:bridge` | 2 / 2 ✅ |
| Database — Phase 1 (31) + Phase 2 billing lifecycle & knowledge (18) | `npm run test:db` | 49 / 49 ✅ |
| Real Word document (generated with the `docx` library) → text | manual | ✅ Arabic, English, table row on one line |
| Syntax of all 198 TS/TSX files, bridge, service worker; strict type-check of the 5 new dependency-free modules | — | ✅ |

## 8. Not verified here (do this on your machine / staging)
The workspace cannot reach the npm registry, so `next build` and browser runs of the real app were not executed. Real provider calls (Twilio, Meta, OpenAI, MyFatoorah, Stripe) need your keys and were **not** made — nothing in this report claims they succeeded.
1. `npm install && npm run build` — fix any type errors.
2. Staging call: dial the number → AI greets → ask for a person → call rings your transfer number; transcript appears in Conversations.
3. WhatsApp: send text, a voice note and a photo with a caption; check read ticks and replies.
4. MyFatoorah test card: subscribe, then cancel → confirm in the MyFatoorah portal that the recurring agreement is cancelled.
5. Stripe test mode: subscribe in KWD → billing history shows the correct amount; open the portal.
6. Upload a PDF and a DOCX → both reach *Ready*.
7. On a phone: install the app, open it offline once.

## 9. Your accounts
You have OpenAI and WhatsApp/Twilio accounts ready — enough for live calls and WhatsApp. Supabase is required for any live data (free tier is fine). Payments need MyFatoorah (KNET) and/or Stripe when you're ready to charge.
