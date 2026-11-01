# SAUT AI → AI Business Operating System: inspection & plan

## 1. What already exists (kept as is)

| Area | Existing implementation | Status after upgrade |
|---|---|---|
| Auth & orgs | Supabase Auth, `users`, `organizations`, `memberships` (owner/admin/agent/viewer), onboarding | Kept. Branch scoping added on top via `membership_branches`. |
| AI employees | `ai_employees`, `ai_employee_instructions`, 8-step wizard, detail/test page | Kept. Becomes the **agents** table (extended with role, branch, live status, speaking rate). A read-only `agents` view exposes the new name. |
| Conversation AI | `/api/ai/chat` (OpenAI, tool calls, TEST mode), realtime WebRTC test, voice bridge | Kept. `/api/ai/chat` now runs through the SO orchestration engine; voice bridge reports live status. |
| Tools | `lib/ai/tools.ts` `executeTool()` | Kept as the public entry point; now delegates to the guarded tool registry. |
| Telephony | Twilio voice + status webhooks, recording consent, retention | Kept. Calls get `branch_id`; status updates feed agent live status and workflow triggers (`missed_call`). |
| WhatsApp | Send helper, signed webhook stub | Upgraded: inbound processing, customer identification, AI reply inside the 24 h window, templates, delivery status, health. |
| CRM | `customers` with `tags text[]`, notes field, CSV export | Kept. Adds `leads` pipeline, scoring, `customer_tags`, `customer_notes`, timeline, follow-ups. Existing tags are copied into the new tables; the old column stays. |
| Billing | Plans, Stripe + MyFatoorah checkout, verified webhooks, cancel, usage | Kept. Adds Enterprise plan, add-ons, usage alerts. |
| Admin | Accounts, payments, plans/trial/AI limits, coupons, tickets, health | Kept. Adds overview KPIs, AI usage & provider costs, failed integrations, users, audit log. |
| i18n | AR (RTL) / EN (LTR), cookie + Accept-Language | Kept; all new screens use logical properties and both dictionaries. |
| Demo mode | Fictional data, badged | Kept. New "live" screens never show demo activity: they show an explained empty state instead. |

## 2. Gaps vs. the upgrade brief
Multi-role agents, orchestration with guardrails/confirmation, automations, lead pipeline, BI Q&A, live operations, branches, templates, WhatsApp inbound, add-ons, admin cost/audit views.

## 3. Implementation plan (as built)
1. **Migration `0005_operating_system.sql`**, additive only (`create … if not exists`, `alter … add column if not exists`), no drops: branches, agent_tools, agent_permissions, agent_memory, agent_tasks, agent_executions, workflows, workflow_nodes, workflow_executions, leads, customer_tags (+links), customer_notes, business_reports, notifications, whatsapp_templates, subscription_addons, usage_alerts. Branch-aware RLS.
2. **SO engine (`src/lib/so/`)**: brain (structured intent), router, memory, knowledge retrieval, tool registry with permission + confirmation guardrails, execution tracking with retries, human handoff, audit, workflow runtime, event bus.
3. **APIs** for each new area, all behind `requireApiSession` + role checks + Zod + rate limits.
4. **Screens**: Command Center, Live Operations, Automation Studio, CRM pipeline & timeline, Business Intelligence, Branches, Templates, Notifications; upgraded agent detail, billing and admin.
5. **Verification** in this workspace: syntax check of every file and unit runs of the engine's pure logic (router, guardrails, scoring, workflow evaluator, retry). A full `next build` must be run where npm is reachable (see §5).

## 4. Honesty rules applied everywhere
- Live statuses come from `ai_employees.live_status`, written only by the backend (orchestrator, voice bridge, Twilio status webhook) with a 2-minute freshness window; stale = Online/Offline, never an animation.
- BI answers separate **Measured** (SQL over your data), **Estimated** (stated formula) and **AI interpretation** (model text, labelled).
- Sensitive tools (refunds/payments, deleting or exporting customer data, bulk messaging) are blocked for agents or require human confirmation in the Command Center.
- Medical templates forbid diagnosis/prescription and escalate clinical questions.

## 5. Known limits of this delivery
- The npm registry is blocked in the build workspace, so `npm install && npm run build` has to run on your machine/CI first.
- The visual workflow editor is a structured flow canvas (drag to reorder, yes/no branches) rather than a free-form node graph.
- "Take over a call" requires the Twilio REST API (implemented: redirects the live call to the human's number); joining audio silently is not supported.
- PDF/DOCX text extraction for knowledge retrieval still needs a background job (text and FAQ sources are searchable now).
