# Deploying SAUT AI

Order matters: database → app → payments → telephony → voice bridge → messaging. Each step is optional; anything not configured shows **Not configured** in the UI and never fakes success.

## 0. Requirements
Node 20+, a Supabase project, a Vercel (or any Node) host, and accounts for the providers you want.

## 1. Supabase (auth, database, storage)
1. Create a project (region close to the Gulf, e.g. Frankfurt or Mumbai).
2. Run migrations in order (SQL editor, or `supabase db push`):
   `0001_schema.sql` → `0002_rls.sql` → `0003_seed_plans.sql` → `0004_vault_and_admin.sql` → `0005_enum_values.sql` → `0006_operating_system.sql` → `0007_member_roles.sql` → `0008_phase1_foundation.sql` → `0009_phase2_channels_billing.sql` → `0010_voice_settings.sql` → `0011_orders_inbox.sql` → `0012_account_deletion.sql` → `0013_widget_jobs_email.sql` → `0014_ratings_reports.sql`.
   0011 is additive (new tables products/orders/order_items/order_events, one new column `conversations.staff_read_at`, functions `create_order` and `erase_customer`); it changes no existing rows.
   0005/0006 are additive (no drops) and safe to run on an existing database; existing customer tags and notes are copied into the new CRM tables.
3. Auth → Providers: enable Email; optionally Google (paste its client ID/secret).
   Auth → URL configuration: Site URL = your app URL; add `https://YOUR_APP/auth/callback` to redirect URLs.
4. Enable the **Vault** extension (Database → Extensions) for storing OAuth refresh tokens.
5. Maintenance jobs. On Vercel set `CRON_SECRET` and the daily job in `vercel.json` (`/api/cron/maintenance`) runs both functions below.
   Alternatively (or for hourly billing checks) enable **pg_cron** (Database → Extensions) and schedule them:
   ```sql
   select cron.schedule('purge-conversations', '15 3 * * *', 'select purge_expired_conversations()');
   -- closes ended trials and unpaid MyFatoorah periods, notifies owners (Stripe is synced by its webhooks)
   select cron.schedule('billing-lifecycle',  '0 * * * *',  'select * from expire_lapsed_subscriptions()');
   ```
6. Sign up in the app, then make yourself admin:
   `update users set platform_role = 'admin' where email = 'you@company.com';`

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Project settings → API (server only, never in the browser) |
| `SUPABASE_KNOWLEDGE_BUCKET` | `knowledge` (created by migration 0002) |

Set `NEXT_PUBLIC_DEMO_MODE=false` in production.

## 2. App on Vercel
1. Import the repo; framework = Next.js.
2. Add all variables from `.env.example` that you're using. `NEXT_PUBLIC_APP_URL` must be the public HTTPS URL (Twilio signatures depend on it).
3. Deploy. Check `https://YOUR_APP/api/health`.

## 3. OpenAI (conversations + realtime voice)
`OPENAI_API_KEY`, and optionally `OPENAI_CHAT_MODEL`, `OPENAI_REALTIME_MODEL`, `OPENAI_TTS_MODEL`, `OPENAI_STT_MODEL`. Model names can also be set by admins in /admin. The browser only ever receives a short-lived realtime client secret.

## 4. Payments
### Stripe (international cards, Apple Pay, Google Pay)
1. Create products *Starter / Business / Pro*, each with a monthly and an annual recurring price **in KWD**.
2. Put the six price IDs in `STRIPE_PRICE_*`. Also `STRIPE_SECRET_KEY`.
3. Webhook endpoint: `https://YOUR_APP/api/webhooks/stripe`, events: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Enable Apple Pay / Google Pay in Stripe → Payment methods (domain verification for Apple Pay).

### MyFatoorah (KNET, cards, Apple Pay — Kuwait/GCC)
1. `MYFATOORAH_API_KEY`; `MYFATOORAH_BASE_URL` = `https://apitest.myfatoorah.com` (test) or `https://api.myfatoorah.com` (Kuwait live).
2. Enable **Recurring** on your account for auto-renewal.
3. Webhook v2 → `https://YOUR_APP/api/webhooks/myfatoorah`, events *Transaction status changed*; copy the secret into `MYFATOORAH_WEBHOOK_SECRET`.
Activation only happens after the webhook signature is valid **and** `GetPaymentStatus` reports `Paid`.

## 5. Telephony (Twilio or a compatible regional carrier)
1. Buy/port a number (Kuwait numbers may require a regulatory bundle; alternatively forward your local line to a Twilio number).
2. `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_HUMAN_FALLBACK_NUMBER`.
3. In the dashboard → Integrations → Phone numbers, enter the number and the AI employee ID. The app verifies the number on your Twilio account and sets its voice + status webhooks automatically.

## 6. Voice bridge (live AI phone calls)
Phone audio needs a persistent WebSocket, so the bridge runs as its own small always-on service
(`services/voice-bridge`, with `package.json`, `Dockerfile` and `fly.toml`). It needs only three
variables — **no database key**: everything goes through the app's `/api/internal/*` endpoints.
```bash
# 1. generate the shared secret once and put the SAME value in the app and the bridge
openssl rand -hex 32
# 2a. Fly.io (always-on, Frankfurt region)
cd services/voice-bridge && fly launch --copy-config --no-deploy
fly secrets set OPENAI_API_KEY=… APP_URL=https://YOUR_APP INTERNAL_API_SECRET=…  && fly deploy
# 2b. or any VM / Railway / Render with Docker
docker build -t saut-voice-bridge . && docker run -p 8080:8080 -e OPENAI_API_KEY=… -e APP_URL=… -e INTERNAL_API_SECRET=… saut-voice-bridge
```
Then set in the app: `VOICE_BRIDGE_WSS_URL=wss://<bridge-host>/twilio` and the same `INTERNAL_API_SECRET`.
Check `https://<bridge-host>/health` → `{"ok":true}` and the app's `/api/health` → `ops.voiceBridge: true`.

How a call works: Twilio → `/api/telephony/twilio/voice` creates the call + conversation and returns
TwiML with a **signed 2-minute stream token** → the bridge verifies it, fetches the agent's prompt and
guarded tool list from `/api/internal/session`, streams audio both ways with OpenAI Realtime, writes
transcripts via `/api/internal/call-event`, runs tools via `/api/internal/tool` (same permission
engine as chat), and when the AI escalates, redirects the **live** call to the agent's transfer
number (Twilio REST) after the AI has told the caller. Without the bridge, incoming calls are routed
honestly to your human fallback number.

## 7. WhatsApp Business (Meta Cloud API)
`WHATSAPP_ACCESS_TOKEN` (system-user token), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (any random string). Webhook URL: `https://YOUR_APP/api/webhooks/whatsapp`. Business-initiated messages outside 24 h need approved templates.

### WhatsApp templates
Set `WHATSAPP_BUSINESS_ACCOUNT_ID` to submit templates from the app and sync their approval status. Outside the 24-hour window the AI only sends **approved** templates to customers who opted in.

### WhatsApp behaviour (Phase 2)
- The app routes by `phone_number_id` (stored when you connect), so the right business answers.
- Messages are marked **read** and a **typing indicator** shows while the AI replies.
- **Voice notes** are transcribed with `OPENAI_STT_MODEL` and answered like text; images/documents
  with a caption use the caption; anything the AI can't read is shown to staff with a notification.
- Long replies are split at sentence boundaries under WhatsApp's 4,096-character limit.
- Manual sends from the dashboard are refused (409 `template_required`) outside the 24-hour window.

## 8. Google Calendar
OAuth client (Web), redirect URI `https://YOUR_APP/api/integrations/google/callback`, scope `calendar.events`. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## 9. Email, monitoring & rate limiting
- `RESEND_API_KEY`, `EMAIL_FROM`.
- **Errors:** set `ERROR_MONITORING_DSN` to a Sentry DSN. Errors are sent to Sentry's envelope API
  with plain `fetch` (no SDK); only the error, stack and safe tags (scope, provider…) are sent —
  never message text, phone numbers or emails.
- **Rate limiting:** set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash free tier
  is enough) so limits are shared by all Vercel instances. Without them each instance limits itself.
- **CSP:** `next.config.mjs` ships a `Content-Security-Policy-Report-Only` header. After a release
  with no violations in the browser console, rename the key to `Content-Security-Policy`.

## 9b. Knowledge files
DOCX text is extracted immediately on upload. PDFs (including Arabic and scanned pages) are read
by the OpenAI model after the upload response returns; the document shows *Reading…* then
*Ready* or *Couldn't read* with the reason. Without `OPENAI_API_KEY`, PDFs are marked failed with
an explanation — paste the text instead.

## 9b-2. In-app assistant with a talking face
A floating button in the dashboard opens **SO**, an assistant that listens (mic) and reads typed
commands, answers about the business with read-only, role-scoped data, opens screens on request
("افتح المواعيد"), and speaks its answers with a face that lip-syncs to the voice.
- Needs `OPENAI_API_KEY` (answers, voice `ASSISTANT_VOICE`, speech-to-text).
- **Photoreal human face (optional):** create a Simli account → API key → choose or create an
  AI-generated face (use the "Trinity" faces for the most realistic result) → set `SIMLI_API_KEY`
  and `SIMLI_FACE_ID`. Sessions are capped at 10 min / 2 min idle and start only when the panel is
  opened. Cost is per minute of face video (check Simli's current pricing).
- Without Simli the built-in SO face is shown, with mouth movement driven by the real audio.
- Nothing loads until the button is tapped (lazy-loaded), so dashboard speed is unchanged.

## 9c. Install on phones (PWA)
Nothing to configure. On Android/desktop Chrome an **Install app** button appears in the dashboard
header; on iPhone use Safari → Share → *Add to Home Screen*. The service worker caches only the
app shell and an offline page — never API responses or business data.

## 10. Business Operating System
- Set `INTERNAL_API_SECRET` in both the app and the voice bridge (the bridge reports live status and the caller's first sentence to `/api/internal/status`).
- Platform admin → **AI usage & costs**: set provider cost rates and add-on prices.
- See `docs/OPERATING_SYSTEM.md` for architecture, guardrails, tests and backups.

## Security checklist before launch
- [ ] `NEXT_PUBLIC_DEMO_MODE=false`
- [ ] Service-role key, provider secrets and `INTERNAL_API_SECRET` only in server env
- [ ] All webhooks show successful signed deliveries
- [ ] `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` set (shared rate limits)
- [ ] `ERROR_MONITORING_DSN` set and a test error visible in Sentry
- [ ] `CRON_SECRET` set and `/api/cron/maintenance` shows a 200 in Vercel → Cron Jobs (or pg_cron jobs scheduled)
- [ ] Migrations `0011`–`0014` applied
- [ ] `RESEND_API_KEY` + `EMAIL_FROM` set (owner email alerts) and a test alert received
- [ ] Optional: call `/api/cron/deliveries` every 5 minutes (Bearer `CRON_SECRET`) from pg_cron/pg_net or any scheduler for faster delivery retries
- [ ] Voice bridge `/health` OK and one real test call made (AI answers, transcript saved, transfer works)
- [ ] Switch CSP from Report-Only to enforcing after one clean release
- [ ] Legal review of `/privacy` and `/terms` for Kuwait, KSA PDPL and UAE PDPL; confirm call-recording consent wording
- [ ] Confirm launch prices (currently proposed)

## Backups, rollback and recovery
- **Before any migration:** Supabase → Database → Backups — confirm a recent daily backup exists (Pro plan) or run
  `pg_dump "$SUPABASE_DB_URL" -Fc -f saut-$(date +%F).dump` from a trusted machine. All migrations here are additive and
  re-runnable; none drop tables or columns.
- **App rollback:** Vercel → Deployments → pick the last good deployment → *Promote to Production* (instant, no rebuild).
  Code rollback: `git revert <sha>` and push to `main`.
- **Database rollback:** additive migrations normally don't need reverting — the previous app version ignores new tables.
  To restore data, use Supabase point-in-time recovery / daily backup restore, or `pg_restore` the dump into a new project
  and switch `NEXT_PUBLIC_SUPABASE_URL` / keys.
- **Health:** `GET /api/health` returns database status and which providers are configured (no secrets).
- **CI gates:** every push to `main` runs type-check, build, unit tests, database/RLS tests and the voice-bridge test
  (`check` workflow → `ci-logs` branch) and the end-to-end journey on a local Supabase (`e2e` workflow → `e2e-logs` branch).

## Website chat widget
Dashboard → Integrations → *Website chat widget*: enter your domain, save, paste the one-line `<script>` before `</body>`.
The chat window is served from this app and can only be framed by that domain (CSP `frame-ancestors`).
The status turns **connected** only after the widget has really loaded inside that domain.
