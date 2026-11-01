# SAUT AI — صوت

**Your Business. Our Intelligence. · عملك. ذكاؤنا.**

AI employees that answer calls, book appointments and serve customers 24/7 in Kuwaiti, Saudi, Emirati Arabic, MSA and English. Built for Kuwait, KSA, the UAE and the wider Arab world.

> *SAUT AI is not another chatbot. It is the future of digital employees.*

---

## What's in this repo

| Area | Where |
|---|---|
| Brand: logo, S-wave mark, SO mascot, favicon, app icon | `src/components/brand/`, `public/brand/`, `src/app/icon.svg`, `docs/BRAND.md` |
| Landing page (hero, live demo, how it works, features, showcase, industries, pricing, sample testimonials, FAQ, CTA, footer) | `src/components/landing/Landing.tsx` |
| Auth (email/password, Google, email confirmation, onboarding) | `src/app/login`, `signup`, `auth/*`, `onboarding` |
| Customer dashboard (overview, employees, calls, conversations, CRM, knowledge base, integrations, analytics, billing, settings, support) | `src/app/dashboard/*` |
| 8-step AI employee creator with live preview | `src/components/employees/Wizard.tsx` |
| Conversation tester (text + browser voice) and live realtime voice test (WebRTC) | `src/components/voice/*` |
| Subscriptions, checkout, webhooks (Stripe + MyFatoorah) | `src/app/api/billing/*`, `src/app/api/webhooks/*`, `src/lib/payments/*` |
| Telephony (Twilio incoming calls, status, recording consent) | `src/app/api/telephony/*`, `src/lib/telephony/twilio.ts` |
| Realtime phone voice bridge (Twilio ⇄ OpenAI Realtime) | `services/voice-bridge/server.mjs` |
| Admin control panel (RBAC) | `src/app/admin`, `src/components/admin`, `src/app/api/admin` |
| Database schema, RLS, seed | `supabase/migrations/*.sql` |
| **OS upgrade:** SO engine (brain, router, memory, knowledge, guarded tools, retries, handoff, workflows, BI) | `src/lib/so/` |
| Command Center, Live Operations, Automation Studio, Sales pipeline, Business Intelligence, Branches, Templates | `src/app/dashboard/{command,live,automations,pipeline,intelligence,branches,templates}` |
| Tests: engine + Phase 2 units, voice bridge integration, database | `npm test`, `npm run test:bridge`, `npm run test:db` |
| In-app assistant SO with talking face (photoreal via Simli, built-in fallback), voice + text | `src/components/assistant/`, `src/lib/assistant/`, `src/app/api/assistant/*` |
| Installable phone app (PWA): manifest, icons, offline page, tab bar | `src/app/manifest.ts`, `public/sw.js`, `public/offline.html`, `src/components/pwa/` |
| Bilingual RTL/LTR | `src/lib/i18n/*`, `src/middleware.ts` |

## Honest-by-design

The product never pretends:

- **Demo mode** — with no Supabase keys, the app runs on fictional data and every screen shows a **"Demo data"** badge. Mutations return `{ demo: true }` and the UI says nothing was saved.
- **Payments** — a plan becomes active only from a **verified provider webhook** (Stripe signature; MyFatoorah HMAC + server-side `GetPaymentStatus`). The checkout page never marks anything paid.
- **Integrations** — show **Connected** only after the provider check passes (Twilio number lookup, WhatsApp Graph API call, Google OAuth token, webhook ping).
- **AI tools** — dashboard tests run in TEST mode; the model is told actions were *not* performed. Missing providers return `503 provider_not_configured` and the UI explains which variable is missing.
- **Landing demo & testimonials** — labelled *Simulated demo* and *Sample testimonials — demo content*.

## Quick start

```bash
npm install
cp .env.example .env.local        # leave empty to explore demo mode
npm run dev                       # http://localhost:3000
```

Arabic is the default for visitors whose browser prefers Arabic; switch language from any page.

## Phase 1 (production foundation)
See **[docs/PHASE1_REPORT.md](docs/PHASE1_REPORT.md)** — auth, onboarding, roles, members, appointments, tests.
Run tests: `npm test` (engine) and `scripts/test-db.sh` (database, needs local Postgres).

## Phase 2 (live channels, payments, launch readiness)
See **[docs/PHASE2_REPORT.md](docs/PHASE2_REPORT.md)** — secure live phone calls with real transfer, WhatsApp voice notes and read receipts, KWD payment fixes, MyFatoorah cancellation, billing lifecycle, document reading, Sentry, shared rate limits, installable app.

## Business Operating System
See **[docs/OPERATING_SYSTEM.md](docs/OPERATING_SYSTEM.md)** and the inspection/plan in **[docs/UPGRADE_PLAN.md](docs/UPGRADE_PLAN.md)**.

## Going live

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — Supabase, Vercel, Stripe, MyFatoorah, Twilio, the voice bridge, WhatsApp and Google Calendar, step by step, with every environment variable.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · Framer Motion · Recharts · Supabase (Postgres, Auth, Storage, RLS) · OpenAI (chat + Realtime) · Twilio · Stripe · MyFatoorah · Zod.

## Pricing (proposed launch prices — not confirmed)

| Plan | Monthly | Annual (2 months free) | AI employees |
|---|---|---|---|
| Starter | 19 KWD | 190 KWD | 1 |
| Business | 49 KWD | 490 KWD | 3 |
| Pro | 99 KWD | 990 KWD | 10 |

Admins can edit prices, limits and trial length in **/admin → Plans, trial & limits**; the database is the source of truth.
