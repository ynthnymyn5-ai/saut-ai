# Mira — your AI Chief of Staff

Mira is a personal AI "operating system": one assistant you talk to by **voice or text**, in **English or Arabic**. She sends each request to one of ten specialist agents, remembers what matters about you and your business, and acts in your connected tools.

**Safety rule built into the core:** anything that **sends, deletes, pays or publishes** is never executed directly. Mira queues it as a *pending action*, and it runs only after you approve it (the web confirmation modal, or replying "yes" / «نعم» on Telegram or WhatsApp). Every action, approval and cancellation is written to the Activity log.

---

## Quick start on Replit

1. Create a Repl from this `mira/` folder (import the repo and keep only this folder, or copy it into a new Node.js Repl). `.replit` is included.
2. Add a **PostgreSQL** database from the Database tool. Replit sets `DATABASE_URL` for you, and pgvector is supported.
3. Add your secrets in **Tools → Secrets** (see below). The minimum is `SESSION_SECRET`. Add `OPENAI_API_KEY` for full intelligence and voice.
4. Press **Run**. The Run command installs packages, enables pgvector, pushes the schema, seeds sample data on the first run, and starts the app on port 5000.
5. Open the webview. Sign in with **Replit Auth**: the first account to sign in becomes the owner, and nobody else can use the app.
6. To install it on your phone, open the deployed URL and choose **Add to Home Screen**. It installs as a PWA.

**Deploying:** use **Reserved VM**. It is already set in `.replit`, and it keeps the reminder and morning-brief scheduler running all day.

## Running locally

```bash
cd mira
cp .env.example .env              # set DATABASE_URL (Postgres with the pgvector extension available)
npm install
npm run db:setup                  # CREATE EXTENSION vector + drizzle push + seed
npm run dev                       # http://localhost:5000
npm test                          # core tests (confirmation gate, dates, chat turn)
```

Without `REPL_ID`, development mode signs you in automatically as the local owner. In production you must either run on Replit or set `AUTH_DISABLED=true` explicitly.

---

## Secrets

| Secret | Required? | What it does |
|---|---|---|
| `DATABASE_URL` | **Yes** (Replit sets it) | PostgreSQL connection string |
| `SESSION_SECRET` | **Yes** | Long random string used to sign login cookies |
| `OPENAI_API_KEY` | Recommended | GPT-4o reasoning and tool calling, embeddings, Whisper speech-to-text, TTS voice. **Without it Mira runs in offline mode**: a rule-based router understands the common commands, and the browser's built-in voice is used, so you can test every screen for free. |
| `OWNER_EMAIL` | Optional | Locks sign-in to this email. Otherwise the first account to sign in becomes the owner. |
| `OPENAI_MODEL` / `OPENAI_FAST_MODEL` | Optional | Defaults are `gpt-4o` / `gpt-4o-mini` |
| `OPENAI_TTS_VOICE` | Optional | Default `shimmer` |
| `TAVILY_API_KEY` | Optional | Live web search for the Researcher agent, with sources |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | For Calendar and Gmail | Google OAuth client (see below) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID` | For Telegram | Bot from @BotFather. Send `/start` to the bot and it replies with your chat ID. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_OWNER_NUMBER` | For WhatsApp | WhatsApp Business Cloud API (Meta) |
| `NOTION_TOKEN` | For Notion | Internal integration token. Share pages with the integration. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional | Web Push keys. If you leave them out, they are generated once and stored in the database. |
| `TZ` | Optional | Your timezone. Default `Asia/Kuwait`. Used for "today", "tomorrow at 10" and the brief time. |
| `BRIEF_HOUR` | Optional | Hour of the morning brief. Default `7`. |
| `CURRENCY` | Optional | Default `KWD` |
| `APP_URL` | Optional | Public URL for OAuth callbacks and webhooks. It is detected automatically on Replit. |

Keys live only in environment variables, never in the code. OAuth tokens that Mira receives (Google) are stored in the `integration_accounts` table.

### Setting up each integration

- **Google Calendar and Gmail:** in Google Cloud Console, enable the *Google Calendar API* and the *Gmail API*. Create an OAuth client of type *Web application* and add the redirect URI `https://<your-app>/api/integrations/google/callback`. Put the client ID and secret in Secrets, then click **Connect** in Settings → Integrations. One consent covers both. Until Google is connected, Mira uses a **local calendar** and a **sample inbox** (both seeded and clearly labelled), and "sending" in sample mode only marks the draft as sent.
- **Telegram:** add the token and chat ID, restart, and click **Connect** in Settings. This registers the webhook. Text messages and voice notes work. Confirmations are answered with "yes" or "no".
- **WhatsApp:** in the Meta app, set the webhook URL to `https://<your-app>/api/integrations/whatsapp/webhook` with your `WHATSAPP_VERIFY_TOKEN`, and subscribe to `messages`. Only `WHATSAPP_OWNER_NUMBER` is served.
- **Notion:** create an internal integration, add `NOTION_TOKEN`, and share the pages Mira may use with it.

---

## What's inside

```
mira/
├── shared/               agent metadata + API types used by client and server
├── server/
│   ├── index.ts          Express app (Vite middleware in dev, static in prod)
│   ├── env.ts            all configuration / secrets
│   ├── auth/             Replit Auth (OIDC) + single-owner lock
│   ├── llm/              ★ provider layer — the ONLY place that knows about OpenAI
│   │   ├── types.ts      LLMProvider interface (chat+tools, embed, transcribe, speak)
│   │   ├── openai.ts     GPT-4o / embeddings / Whisper / TTS
│   │   ├── local.ts      offline fallback (rule-based, EN+AR)
│   │   └── index.ts      picks the provider
│   ├── agents/
│   │   ├── registry.ts   system prompt for each of the 10 agents
│   │   ├── orchestrator.ts  Chief-of-Staff loop: memory → tools / delegate_to_* → reply
│   │   └── inbound.ts    Telegram/WhatsApp turns + "yes/no" confirmations
│   ├── tools/            typed tools (zod) per domain + registry/executor with the confirmation gate
│   ├── memory/           pgvector memories, auto-extraction, semantic search
│   ├── integrations/     plugin system: google/{calendar,gmail}, messaging (Telegram, WhatsApp), notion
│   ├── brief/            daily brief + scheduler (reminders, morning brief)
│   ├── push/             Web Push (VAPID)
│   ├── routes/           REST API
│   ├── db/               Drizzle schema, setup, seed
│   └── tests/            node:test suite
└── client/               React + Vite + Tailwind + Framer Motion PWA
    ├── src/components/Orb.tsx        canvas orb (idle / listening / thinking / speaking)
    ├── src/voice/                    mic, Whisper/browser STT, TTS, wake word, audio levels
    ├── src/pages/                    Home, Dashboard, History, Activity, Settings
    ├── src/agents/                   one panel per agent
    ├── src/i18n/                     English + Arabic (RTL)
    └── public/                       manifest, service worker, icons
```

### The agents

| Agent | Panel | Tools |
|---|---|---|
| **Chief of Staff** | Daily brief, today's meetings, urgent tasks, follow-ups, key numbers, inbox | delegates to every other agent; tasks, calendar, Gmail, memory, brief |
| **Researcher** | Research reports with sources | `web_search` (Tavily), notes, Notion |
| **Strategist** | Decisions and plans with pros and cons | notes, web search |
| **Sales** | CRM pipeline table (name, stage, value, next step, follow-up date) | leads CRUD, Gmail drafts, WhatsApp |
| **Marketing** | Content calendar, ideas and drafts board | content items, web search |
| **Operations** | Kanban board (To do / In progress / Done) with priorities and due dates | tasks, reminders, calendar |
| **Finance** | Monthly KPIs, 6-month chart, spending by category, transactions, invoices | transactions, summaries, invoices |
| **Engineering** | Snippets and specs with copyable code | notes, Notion |
| **Design** | Briefs and moodboards with colour palettes | notes, Notion |
| **Memory** | View, search (semantic), edit, pin and delete memories | save, search, delete memories |

**How a request flows:** your message goes to the Chief of Staff. The system prompt is built from the agent prompt, the current time in your timezone, and the most relevant memories from pgvector plus pinned ones. The Chief either calls its own tools or calls `delegate_to_<agent>`. Each specialist then runs its own tool loop with its own prompt. The Chief combines the results into one reply in the language you used. Facts worth keeping are extracted in the background and saved as memories.

**Actions that need confirmation:** `delete_task`, `delete_lead`, `delete_transaction`, `delete_note`, `delete_memory`, `gmail_send`, `send_whatsapp_message`, `calendar_create_event`, `calendar_update_event`, `calendar_delete_event`, `notion_create_page`, and `update_content_item` when it marks a post as published. Drafting an email is safe; sending one is not.

### Swapping in Claude (or another model)

Create `server/llm/anthropic.ts` that implements `LLMProvider` from `server/llm/types.ts`. Messages and tools are already provider-neutral (JSON-schema tools, `toolCalls` / `toolCallId`). Then return it from `server/llm/index.ts`. Voice can stay on OpenAI, or you can wrap a different speech vendor in the same interface. Note that embeddings from different providers aren't compatible: Mira detects a provider change on startup and re-embeds all memories automatically.

### Adding an integration

Write an `IntegrationPlugin` (`server/integrations/types.ts`) with `status()`, optional `connectUrl` / `connect()` / `disconnect()`, `tools` and `routes` / `publicRoutes`. Then add it to `server/integrations/registry.ts`. It appears in Settings automatically, and its tools are offered to the agents listed on each tool. Mark tools that act externally with `confirm: true`.

### Voice

- **With `OPENAI_API_KEY`:** the mic is recorded with MediaRecorder and stops when you release push-to-talk or after about 1.4 s of silence. Whisper transcribes it, and the reply is spoken with OpenAI TTS. The orb is driven by real audio analysers for both your mic and Mira's voice.
- **Without it:** the browser's Web Speech API is used for both directions.
- **Wake word "Mira" / «ميرا»:** toggle it on the Home screen. It uses continuous browser speech recognition (Chrome, Edge, Safari 17+). Saying "Mira, what's on today?" runs the question directly.
- Voice turns are always spoken. Typed replies are spoken only if you turn that on in Settings.

### Sample data

`npm run db:seed` wipes the business tables and reseeds them. The demo scenario is **Noor Studio**, a Kuwait-based handmade candle brand: tasks, leads, 6 months of finances, invoices, a content calendar, research, strategy, engineering and design notes, a local calendar, a sample inbox in English and Arabic, memories, conversations and activity.

### Notes and limits

- On Replit **Autoscale** deployments the in-process scheduler sleeps. Use a Reserved VM, or call `POST /api/brief/send` from an external cron.
- iOS supports Web Push only for installed PWAs (iOS 16.4+).
- Times on screen use your device's timezone. Mira reasons in `TZ`, so keep the two the same.
