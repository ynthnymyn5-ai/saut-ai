# SAUT AI — Phase 1 report: frontend → production backend

Date: 30 Oct 2026. Status: **implemented; database layer verified; app build pending** (see “Verification limits”).

## 1. Inspection findings
The project was not frontend-only: it already had Next.js 15 + TypeScript + Tailwind, Supabase Auth/Postgres/Storage clients, 6 migrations with RLS, server API routes with Zod, sign-up/login/logout, a basic onboarding, AI employee create/activate/delete, CRM, conversations and settings. Phase 1 kept all of it and filled these gaps:

| Spec item | Before | Phase 1 |
|---|---|---|
| `profiles` table | `users` table (profile mirror) | `profiles` view over `users` (no data moved) |
| Roles Owner/Admin/Manager/Employee | owner/admin/agent/viewer | + `manager`, `employee` (agent = employee, viewer = read-only) enforced in SQL and API |
| Password reset | missing | `/forgot-password`, `/reset-password`, recovery handling in `/auth/callback` |
| Profile management | missing | Settings → Your profile (`/api/profile`) |
| Onboarding (org → industry → business info) | name + country | 3-step wizard → `create_organization()` RPC (org + owner + free trial + audit, atomic) |
| Organization profile | name, country, industry, timezone | + contact email/phone, address, preferred language, onboarding state; Settings → Business profile |
| Members | none in UI | Settings → Team & roles: invite, change role, remove, leave |
| Appointments screen | none | `/dashboard/appointments` with create, status, reschedule (never hard-deleted) |
| Customers CRUD | list/notes | + create, edit name/phone/email |
| AI employee editing | role/tools/permissions/instructions | + Details tab: name, dialect, voice, personality, business info |

## 2. Database
Migrations (version-controlled, additive, re-runnable):
- `0007_member_roles.sql` — adds `manager`, `employee` to `member_role`.
- `0008_phase1_foundation.sql` — `profiles` view; organization profile columns; `updated_at` + triggers on memberships/conversations/appointments; role-group functions `can_manage_ai()` / `can_operate()`; rewritten write policies; last-owner protection; owner-grant protection; self-leave policy; `create_organization()`.

Core tables required by the spec and where they live: profiles (view on `users`), organizations, memberships, ai_employees, ai_employee_instructions, customers, conversations, messages, appointments, usage_records, audit_logs. All use UUID keys (audit_logs uses an identity bigint for append-only ordering), foreign keys, indexes and CHECK constraints. `messages`, `usage_records`, `audit_logs` and `ai_employee_instructions` are append-only by design and have only `created_at`.

## 3. Permissions (enforced in RLS and again in the API)
| Action | Owner | Admin | Manager | Employee | Viewer |
|---|---|---|---|---|---|
| Read organization data | ✓ | ✓ | ✓ | ✓ | ✓ |
| Customers, conversations, appointments, uploads | ✓ | ✓ | ✓ | ✓ | – |
| AI employees, instructions, automations, approvals | ✓ | ✓ | ✓ | – | – |
| Business profile, members, integrations, billing | ✓ | ✓ | – | – | – |
| Grant/transfer ownership | ✓ | – | – | – | – |

Branch-scoped members (Phase OS) only see their branches. Organizations always keep ≥1 owner.

## 4. API endpoints added in Phase 1
| Method & path | Who | Purpose |
|---|---|---|
| `GET/PATCH /api/profile` | signed-in user | own profile |
| `POST /api/onboarding` | signed-in user without org | create organization via RPC |
| `GET/PATCH /api/organization` | members / owner+admin | business profile + subscription reference |
| `GET/POST /api/members` | members / owner+admin | team list, invite by email |
| `PATCH/DELETE /api/members/[id]` | owner+admin / self | change role, remove, leave |
| `GET/POST /api/appointments` | members / operate | list by range+status, create |
| `PATCH /api/appointments/[id]` | operate | status, reschedule, notes |
| `POST /api/customers` | operate | create customer |
| `PATCH /api/customers/[id]` | operate | edit name, phone, email, tags, notes, consent |
| `PATCH /api/employees/[id]` | owner/admin/manager | now also business info |
Existing endpoints (employees, knowledge, settings/privacy, etc.) now use the same role groups (`src/lib/rbac.ts`).

## 5. Authentication status
Implemented with Supabase Auth: sign-up with email confirmation, login, Google OAuth, logout, password reset (email link → `/auth/callback` → `/reset-password`), session persistence via HTTP-only cookies refreshed in middleware, protected `/dashboard` and `/admin`, onboarding redirect for users without an organization, profile editing. Arabic and English on every new screen.

## 6. Security measures
RLS on every table (default deny); role checks server-side before every write; SECURITY DEFINER functions with fixed `search_path`; Zod validation in API + CHECK constraints in SQL; rate limiting per route; magic-byte file validation; audit entries for org, member, profile, customer, appointment and employee changes; service-role key used only server-side (webhooks, admin, member invites after role check); no open redirects in the auth callback; password-reset screen never reveals whether an email exists.

## 7. Environment variables (Phase 1 needs only these)
| Variable | Where to get it | Exposed to browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | yes (public by design) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page → `anon` public key | yes (safe: RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | same page → `service_role` secret | **never** — server only (invites, admin, webhooks) |
| `NEXT_PUBLIC_APP_URL` | your deployed URL, e.g. `https://app.saut.ai` | yes |
| `NEXT_PUBLIC_DEMO_MODE` | `false` in production | yes |

## 8. Configuration steps
1. Create a Supabase project; run migrations `0001` → `0008` in order (`supabase db push` or SQL editor).
2. Auth → URL configuration: Site URL = `NEXT_PUBLIC_APP_URL`; add `https://YOUR_APP/auth/callback` to Redirect URLs.
3. Auth → Email templates: keep the default `{{ .ConfirmationURL }}` links (they route through `/auth/callback`). Set your sender in SMTP settings for production.
4. Set the variables above in `.env.local` (dev) or your host (prod). Set `NEXT_PUBLIC_DEMO_MODE=false`.
5. `npm install && npm run build && npm start`.
6. Sign up, complete onboarding, then (optional) make yourself platform admin: `update users set platform_role = 'admin' where email = 'you@…';`

## 9. Tests performed
| # | Area | How | Result |
|---|---|---|---|
| 1 | Registration (profile row) | SQL test: auth user → `users`/`profiles` | ✅ |
| 2 | Organization creation | SQL test: `create_organization()` incl. invalid name/timezone/email rejected, trial + audit created | ✅ |
| 3 | Membership permissions | SQL tests for owner/admin/manager/employee/viewer (create/edit employees, customers, appointments, org profile, roles) | ✅ |
| 4 | AI employee creation/editing | SQL: manager creates + edits employee and instructions; employee blocked; plan limit enforced | ✅ |
| 5 | Customer data access & org isolation | SQL: cross-org reads return nothing, cross-org writes rejected by RLS | ✅ |
| 6 | Ownership safety | SQL: last owner can't be demoted, admin can't grant owner, handover works, member can leave | ✅ |
| 7 | Engine logic | `npm test` (14 unit tests) | ✅ |
| 8 | Code integrity | TypeScript parse of all 185 source files; strict type-check of dependency-free modules | ✅ |
Run them yourself: `npm test` and `PGHOST=… PGUSER=postgres scripts/test-db.sh` (needs a local Postgres 15+).

## 10. Verification limits (not yet verified)
The build workspace cannot reach the npm registry, so **`next build`, browser login/logout/password-reset flows, Arabic RTL / English LTR rendering and mobile layouts of the new screens were not executed here**. They are implemented but must be checked on your machine:
1. `npm install && npm run build` — fix any type errors reported.
2. Click through: sign up → confirm email → onboarding → dashboard → logout → login → forgot password → reset.
3. Switch language on Settings, Appointments and Onboarding; check at 390 px width.

## 11. Remaining / out of scope for Phase 1
- End-to-end browser tests (Playwright) — recommended next, once the app builds.
- Profile photo upload and email-address change.
- Member invitations re-send / revoke UI (Supabase sends the original invite).
- Appointment calendar (week/month) view; the list view is implemented.
- Phase 2 items (voice calls, WhatsApp live traffic, payments) exist in code from earlier work but are **not part of this phase's verification** and need provider credentials.
