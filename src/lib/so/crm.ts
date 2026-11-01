import "server-only";
import type { DB } from "./context";
import { scoreLead, suggestFollowUp, type LeadSignals } from "./scoring";

/** Gather lead signals from recorded interactions only. */
export async function leadSignals(db: DB, orgId: string, leadId: string): Promise<(LeadSignals & { customerId: string }) | null> {
  const { data: lead } = await db.from("leads").select("customer_id, stage, source, estimated_value, interest").eq("id", leadId).eq("organization_id", orgId).maybeSingle();
  if (!lead) return null;
  const cid = lead.customer_id as string;
  const [convs, appts, cust] = await Promise.all([
    db.from("conversations").select("intent, sentiment, started_at").eq("organization_id", orgId).eq("customer_id", cid).order("started_at", { ascending: false }).limit(50),
    db.from("appointments").select("status").eq("organization_id", orgId).eq("customer_id", cid),
    db.from("customers").select("last_contact_at").eq("id", cid).maybeSingle(),
  ]);
  const c = convs.data ?? [];
  const last = cust.data?.last_contact_at ?? c[0]?.started_at ?? null;
  return {
    customerId: cid,
    stage: lead.stage as LeadSignals["stage"],
    source: lead.source as string,
    conversations: c.length,
    appointments: (appts.data ?? []).length,
    completedAppointments: (appts.data ?? []).filter((a) => a.status === "completed").length,
    lastContactDaysAgo: last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null,
    askedPricing: c.some((x) => x.intent === "pricing" || x.intent === "purchase_interest") || /price|سعر|كم/i.test(String(lead.interest ?? "")),
    hasEstimatedValue: lead.estimated_value !== null,
    negativeSentiment: c.slice(0, 3).some((x) => x.sentiment === "negative"),
  };
}

export async function rescoreLead(db: DB, orgId: string, leadId: string) {
  const s = await leadSignals(db, orgId, leadId);
  if (!s) return 0;
  const { score, reasons } = scoreLead(s);
  const next = suggestFollowUp(s);
  await db.from("leads").update({
    score, score_reasons: reasons,
    next_follow_up_at: next ? new Date(Date.now() + next.dueInDays * 86400000).toISOString() : null,
  }).eq("id", leadId).eq("organization_id", orgId);
  return score;
}

export async function tagCustomer(db: DB, orgId: string, customerId: string, name: string) {
  const { data: tag } = await db.from("customer_tags").upsert({ organization_id: orgId, name: name.slice(0, 30) }, { onConflict: "organization_id,name" }).select("id").single();
  if (tag) await db.from("customer_tag_links").upsert({ customer_id: customerId, tag_id: tag.id }, { onConflict: "customer_id,tag_id" });
  const { data: c } = await db.from("customers").select("tags").eq("id", customerId).eq("organization_id", orgId).maybeSingle();
  const tags = new Set<string>((c?.tags as string[]) ?? []);
  tags.add(name);
  await db.from("customers").update({ tags: [...tags] }).eq("id", customerId).eq("organization_id", orgId); // keep legacy column in sync
}

export type TimelineItem = { at: string; kind: "call" | "conversation" | "appointment" | "note" | "lead" | "task"; title: string; detail?: string | null; status?: string | null };

export async function customerTimeline(db: DB, orgId: string, customerId: string): Promise<TimelineItem[]> {
  const [calls, convs, appts, notes, leads, tasks] = await Promise.all([
    db.from("calls").select("started_at, status, duration_sec, direction").eq("organization_id", orgId).eq("customer_id", customerId).limit(100),
    db.from("conversations").select("started_at, channel, status, summary").eq("organization_id", orgId).eq("customer_id", customerId).limit(100),
    db.from("appointments").select("starts_at, kind, status, party_size").eq("organization_id", orgId).eq("customer_id", customerId).limit(100),
    db.from("customer_notes").select("created_at, body").eq("organization_id", orgId).eq("customer_id", customerId).limit(100),
    db.from("leads").select("created_at, stage, interest, score").eq("organization_id", orgId).eq("customer_id", customerId).limit(20),
    db.from("agent_tasks").select("created_at, title, status, kind").eq("organization_id", orgId).eq("customer_id", customerId).limit(50),
  ]);
  const items: TimelineItem[] = [
    ...(calls.data ?? []).map((c) => ({ at: c.started_at, kind: "call" as const, title: `${c.direction} call`, detail: c.duration_sec ? `${Math.round(c.duration_sec / 60)} min` : null, status: c.status })),
    ...(convs.data ?? []).map((c) => ({ at: c.started_at, kind: "conversation" as const, title: `${c.channel} conversation`, detail: c.summary, status: c.status })),
    ...(appts.data ?? []).map((a) => ({ at: a.starts_at, kind: "appointment" as const, title: a.kind + (a.party_size ? ` · ${a.party_size}` : ""), status: a.status })),
    ...(notes.data ?? []).map((n) => ({ at: n.created_at, kind: "note" as const, title: "Note", detail: n.body })),
    ...(leads.data ?? []).map((l) => ({ at: l.created_at, kind: "lead" as const, title: `Lead · score ${l.score}`, detail: l.interest, status: l.stage })),
    ...(tasks.data ?? []).map((t) => ({ at: t.created_at, kind: "task" as const, title: t.title, status: t.status })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at));
}
