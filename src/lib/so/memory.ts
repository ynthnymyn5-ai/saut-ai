import "server-only";
import type { DB } from "./context";

/** Agent Memory: recent turns of this conversation + durable facts about this customer. */
export async function loadMemory(db: DB, orgId: string, opts: { conversationId?: string; customerId?: string; turns?: number }) {
  const [history, facts] = await Promise.all([
    opts.conversationId
      ? db.from("messages").select("role, content").eq("organization_id", orgId).eq("conversation_id", opts.conversationId).order("created_at", { ascending: false }).limit(opts.turns ?? 12)
      : Promise.resolve({ data: [] as { role: string; content: string }[] }),
    opts.customerId
      ? db.from("agent_memory").select("kind, content").eq("organization_id", orgId).eq("customer_id", opts.customerId).order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] as { kind: string; content: string }[] }),
  ]);
  return {
    history: ((history.data ?? []) as { role: string; content: string }[]).reverse()
      .filter((m) => m.role === "customer" || m.role === "ai" || m.role === "human")
      .map((m) => ({ role: m.role === "customer" ? ("user" as const) : ("assistant" as const), content: m.content })),
    facts: ((facts.data ?? []) as { kind: string; content: string }[]).map((f) => `${f.kind}: ${f.content}`),
  };
}

export async function remember(db: DB, m: { orgId: string; agentId?: string; customerId: string; conversationId?: string; kind: "fact" | "preference" | "summary" | "context"; content: string; ttlDays?: number }) {
  await db.from("agent_memory").insert({
    organization_id: m.orgId, agent_id: m.agentId ?? null, customer_id: m.customerId, conversation_id: m.conversationId ?? null,
    kind: m.kind, content: m.content.slice(0, 2000), expires_at: m.ttlDays ? new Date(Date.now() + m.ttlDays * 86400000).toISOString() : null,
  });
}
