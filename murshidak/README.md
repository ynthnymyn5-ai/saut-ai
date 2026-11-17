# مرشدك · Murshidak

**Your smart guide to government services in Kuwait.** Describe what you need in plain words (or by voice), e.g. «أبي أجدد إقامة الخادمة», and get a clear step-by-step roadmap: who handles each step, the documents to bring, fees, expected time, and whether it's online (Sahel) or in person.

> Murshidak is an **independent guide, not an official government app**, and it does **not** execute transactions. Every roadmap shows: «المعلومات إرشادية، تأكد من الجهة الرسمية قبل التقديم».

| Home | Roadmap | Documents | Agents |
|---|---|---|---|
| ![](docs/screenshots/04-home.jpg) | ![](docs/screenshots/06-roadmap.jpg) | ![](docs/screenshots/07-wallet.jpg) | ![](docs/screenshots/10-agents.jpg) |

## Run it

```bash
cd murshidak
npm install
npm start            # http://localhost:3100
npm test             # API tests (node:test)
npm run reset        # wipe local data; sample data is re-seeded on next start
```

Needs Node ≥ 22.13. Dependencies: Express and `pg`.

**Database.** With `DATABASE_URL` set, the app uses Postgres (Supabase); without it, a local SQLite file (`node:sqlite`), which is what `npm test` uses. The same SQL runs on both (`lib/db.js`). Tables are created and sample data seeded automatically on first start; an advisory lock makes this safe when several serverless instances start at once. To run the tests against Postgres: `TEST_DATABASE_URL=postgres://… npm test` (point it at an empty schema).

## Live deployment

- **App:** Vercel project `murshidak` (team SAUT AI), function region `hnd1` (Tokyo), next to the database.
- **Database:** Supabase project `hmidan6611@gmail.com` (`dbcxopmhwpjjbqyrfqps`, Tokyo), schema **`murshidak`**, owned by a dedicated login role **`murshidak_app`**. That role can't read any other table in the project, and the schema is not exposed through Supabase's REST API, so only the app server reaches it.
- **Secrets on Vercel (sensitive, write-only):** `DATABASE_URL` (pooler, transaction mode, port 6543, user `murshidak_app.<project-ref>`) and `MURSHIDAK_SECRET`. Back up `MURSHIDAK_SECRET`: without it, stored documents can't be decrypted. To rotate the database password: `alter role murshidak_app password '…'` in Supabase, then update `DATABASE_URL` on Vercel.

**Sample accounts** (type the number on the sign-in screen; there are no shortcut buttons). No SMS provider is wired yet, so the OTP is shown on screen and labeled as a demo code:

| Phone | Account |
|---|---|
| `99999999` | Family plan: spouse, 2 children, maid and driver, 13 documents, 4 bookings |
| `98888888` | Business plan: company with 5 employees' residencies |
| `90000000` | Admin: edit procedures, approve agents, advance bookings |

## Features

| Feature | Where |
|---|---|
| Onboarding (3 slides) → phone + OTP sign-in → name | `public/app.js` (`#/onboarding`, `#/login`) |
| Smart request box with mic (Web Speech, `ar-KW`) | Home screen; `POST /api/ask` |
| Request understanding: LLM picks from the library, with a local Arabic/Kuwaiti-dialect matcher as fallback | `lib/ai.js` |
| Roadmap: numbered steps, responsible entity, online/in-person per step, fees, duration, documents checklist (saved on device), Sahel link, suggested agents, disclaimer at top and bottom | `#/p/:slug` |
| Library of 20 procedures, bilingual, editable | `lib/procedures-data.js` (seed), admin panel |
| Documents wallet per family member: photo/PDF, number, expiry | `#/wallet`, `#/wallet/doc/:id` |
| Expiry dashboard (red < 30 days, yellow < 90, green) + in-app notifications at 30 and 7 days, and when expired | Home, `#/notifications`, `runReminders()` in `server.js` (runs at start, hourly, and on every change) |
| Family profiles: spouse, children, parents, domestic workers, employees (Business) | `#/family` |
| Agents marketplace: verified agents, rating, price, filters, booking; agent applications await admin approval | `#/agents`, `#/agents/apply` |
| Booking tracking: requested → accepted → in progress → done (+ cancel) | `#/bookings`, admin bookings tab |
| Plans: Free (3 documents, guides), Family (unlimited + reminders), Business (+ employees), enforced on the server | `#/plans`, `PLANS` in `server.js` |
| Admin panel: stats, add/edit/reorder procedure steps and documents, matcher keywords, publish/unpublish, approve/reject agents | `#/admin` |
| Arabic RTL by default, English toggle everywhere (UI and procedure content) | `public/i18n.js` |

## Security and privacy

- **Uploads** are stored encrypted with AES-256-GCM in the database (`files` table, never publicly reachable) and served only to their owner (`Cache-Control: no-store`). Type is checked against the file's magic bytes; max 3 MB. Images are resized on the device before upload.
- **ID numbers** are encrypted at rest and **masked in every list** (`•••• 1234`). The full number is returned only by `GET /api/documents/:id/number` when the owner taps "Show", and is hidden again after 15 seconds.
- **The encryption key** comes from `MURSHIDAK_SECRET` (required with Postgres). Locally, if it isn't set, one is generated in `DATA_DIR/.secret`.
- OTPs are hashed, expire after 5 minutes, allow 5 attempts, and are rate-limited per phone and per IP. Sessions are random tokens, stored hashed, in an `HttpOnly; SameSite=Lax` cookie (set `COOKIE_SECURE=1` behind HTTPS).
- Users can delete their account, which removes all their data and files.

## Configuration (`.env.example`)

Everything is optional. With no settings, the app runs in demo mode.

- `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`: turn on LLM understanding (the same provider the rest of this repo uses). The model may only return a slug that exists in the library; anything else is discarded. If the call fails or times out, the local matcher answers instead. Each answer is labeled "understood by AI" or "auto-matched".
- `SMS_PROVIDER`: setting this hides the on-screen demo code. **No SMS gateway is wired yet**, so connect one in `POST /api/auth/request-otp` before going live.
- `ADMIN_PHONES`: comma-separated phone numbers that are admins. There is no default. A listed number becomes admin when it signs up, or on its next sign-in if the account already exists.
- `SEED_DEMO_ACCOUNTS`: whether to create the three sample accounts on first start. On by default only for local SQLite; the live database never gets them.

## Services and how to turn them on

Each outside service switches on by itself when its environment variables are set (see `.env.example`); the admin panel's Stats tab shows which are live. Until then the app says plainly that a feature is not enabled.

| Feature | Needs | Notes |
|---|---|---|
| SMS sign-in codes | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (or `TWILIO_MESSAGING_SERVICE_SID`) | The on-screen demo code disappears once set. |
| WhatsApp reminders | Twilio vars + `TWILIO_WHATSAPP_FROM` (+ `TWILIO_WHATSAPP_CONTENT_SID`) | WhatsApp only delivers business-initiated messages through an approved template. Users opt in under Profile. |
| Phone push notifications | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | On iPhone, push works only after "Add to Home Screen" (iOS 16.4+). |
| Daily reminders job | `CRON_SECRET` | `vercel.json` runs `/api/cron/reminders` daily at 08:00 Kuwait time; each notification is sent once. |
| Read expiry from a photo, AI request matching | `OPENAI_API_KEY` | The photo is sent to OpenAI only when the user taps the scan button; the privacy page says so. |
| Paid plans (KNET / cards) | `MYFATOORAH_API_KEY`, `MYFATOORAH_BASE_URL`, `PUBLIC_URL` | A plan is activated only after a server-to-server check that MyFatoorah reports **Paid** for the exact amount. 30 days, no auto-renew; expired plans fall back to Free. |

Other additions:
- **Agent portal** (`#/agent`): an approved agent signs in with the phone number on their agent profile, moves each request forward (the customer is notified), and sees the customer's number only while working on it. Customers rate the agent once a request is done; the agent's average updates.
- **Error reports**: every roadmap has "report an error"; admins review them in the Reports tab.
- **Excel / CSV import** (Business plan, Family screen): headers in Arabic or English; Excel date cells and `DD/MM/YYYY` are understood; errors name the exact spreadsheet row. Read on the device with a built-in reader (no external library); `.xls` (Excel 97) is not supported, save as `.xlsx` or CSV.
- **Privacy policy and terms** pages (`#/privacy`, `#/terms`), linked from sign-in and Profile. Add a contact email to them before launch.
- **Database migrations** (`lib/migrations.js`): versioned, applied once per database on startup under the same lock as seeding.

## Not done yet

- **Payments:** until MyFatoorah is configured, changing plans is free, and the Plans screen says so.
- **Keys for outside services** (table above): the code is ready; the accounts and keys are not.
- **Fees and durations** in the seed are approximate. Many are worded as "shown when applying" on purpose. An admin should check each one against the official entity before launch.
