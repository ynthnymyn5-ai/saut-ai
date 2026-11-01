# SAUT AI Business Operating System — how it works

## Architecture

```
 Phone (Twilio) ─┐          ┌──────────────────────── SO engine (src/lib/so) ────────────────────────┐
 WhatsApp (Meta) ├─ webhooks│ Brain (brain.ts)      structured intent, rules fallback                 │
 Web / tests ────┘   ─────► │ Router (router.ts)    picks the AI employee by role + branch             │
                            │ Memory (memory.ts)    recent turns + durable customer facts              │
                            │ Knowledge (knowledge) full-text search over ready documents              │
                            │ LLM loop (orchestrator.ts) ──► Tool Execution Engine (engine.ts)         │
                            │                                 ├ Guardrails (permissions.ts)            │
                            │                                 ├ allow → run with retries (retry.ts)    │
                            │                                 ├ confirm → Command Center approval      │
                            │                                 └ deny → recorded, never executed        │
                            │ Human handoff (router.needsHumanHandoff + transfer_to_human)             │
                            │ Events → Automation Studio (events.ts + workflow-core.ts)                │
                            │ Audit (lib/audit.ts) + agent_executions + workflow_executions            │
                            └──────────────────────────────────────────────────────────────────────────┘
```

All engine code runs server-side with the service role and filters every query by `organization_id`. User-facing APIs first check the session, role and branch scope (`src/lib/so/api.ts`), mirroring the RLS rules in `0006_operating_system.sql`.

## AI employees (agents)
`ai_employees` is the agents table (exposed as the `agents` view). Roles: receptionist, sales, support, manager (internal only, never routed to customers), booking, custom. Each has assigned tools (`agent_tools`), permission overrides (`agent_permissions`), versioned instructions, branch, speaking rate, language, working hours, live status, usage stats and an activity log (`agent_executions`).

## Guardrails
| Rule | Effect |
|---|---|
| `payments.charge`, `payments.refund`, `customers.delete`, `customers.export`, `messages.bulk_send` | Always denied to AI, whatever the configuration |
| `appointments.cancel` | Always needs human confirmation |
| Role defaults | e.g. support can't book, manager can only read reports |
| Test mode | Every tool is simulated and the model is told nothing happened |
| Medical safety profile | No diagnosis/prescriptions; clinical questions → staff; emergencies → 112 |

Pending confirmations appear in **Command Center → Waiting for your approval** and notify owners.

## Live status
Written only by backend events: orchestrator (thinking/working/online), voice bridge via `/api/internal/status` (listening/thinking/speaking/waiting), Twilio webhooks (listening on answer, online on hang-up), escalations (needs attention). The UI applies a 2-minute freshness rule (`status.ts`), so a crashed process can't leave an employee "speaking".

## Automation Studio
Triggers: call received (fires after the caller's first sentence when the voice bridge runs, so intent is known), missed call, WhatsApp message, lead created, appointment created/cancelled, complaint, support case created, payment confirmation (reserved for a customer-payments integration; nothing emits it yet). Conditions branch yes/no; actions go through the same guarded tool engine. Workflows are created disabled; each run stores a step log; failures notify owners. "Run test" is a dry run with no side effects.

## CRM
Pipeline stages new → contacted → interested → qualified → converted / lost (lost requires a reason). Scores are rule-based from recorded interactions with per-point reasons; the AI follow-up suggestion is optional and labelled.

## Business Intelligence
`/api/bi/ask` returns **Measured** numbers (SQL over your rows), **Estimates** with their formula, and an **AI interpretation** that is instructed to use only those numbers. Revenue appears only from CRM deal values or a future sales integration; otherwise the UI says it isn't available.

## Testing
- `npx tsx --test scripts/test-engine.ts` — 14 unit tests for guardrails, router, handoff, retries, scoring, live status, hours, availability, workflows and templates.
- Migrations were applied to PostgreSQL 16 with a Supabase-compatible stub schema; organization isolation and branch scoping were verified with RLS as the `authenticated` role.

## Backup strategy
- Enable Supabase **Point-in-Time Recovery** (Pro plan and above) — recommended retention ≥ 7 days.
- Nightly logical backup to your own storage: `supabase db dump --data-only -f backup-$(date +%F).sql` from CI, encrypted at rest.
- Knowledge files: enable versioning on the storage bucket or mirror it nightly.
- Test a restore into a staging project monthly; retention purges (`purge_expired_conversations`) are intentional and are not restored.
