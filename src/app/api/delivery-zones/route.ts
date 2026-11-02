import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { ok, parseJson, route } from "@/lib/http";
import { ANY_MEMBER, MANAGE_AI } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Delivery zones with their fee and minimum order (members read; owners/admins/managers edit). */
export const GET = route("zones-list", async () => {
  const s = await requireApiSession(ANY_MEMBER);
  if (s.demo) return ok({ demo: true, zones: [] });
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.from("delivery_zones").select("id, name, areas, fee, min_order, is_active").eq("organization_id", s.org.id).order("is_active", { ascending: false }).order("name");
  if (error) throw error;
  return ok({ zones: data ?? [] });
}, { limit: 60 });

const zone = z.object({
  name: z.string().trim().min(1).max(80),
  areas: z.array(z.string().trim().min(1).max(60)).max(100).default([]),
  fee: z.number().min(0).max(1000),
  min_order: z.number().min(0).max(100000).default(0),
  is_active: z.boolean().default(true),
});

export const POST = route("zones-create", async (req) => {
  const s = await requireApiSession(MANAGE_AI);
  const b = await parseJson(req, zone);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.from("delivery_zones").insert({ ...b, fee: Math.round(b.fee * 1000) / 1000, min_order: Math.round(b.min_order * 1000) / 1000, organization_id: s.org.id }).select("id").single();
  if (error) throw error;
  await audit({ orgId: s.org.id, actorId: s.userId, action: "delivery_zone.created", targetType: "delivery_zone", targetId: data.id, metadata: { name: b.name, fee: b.fee } });
  return ok({ id: data.id }, 201);
}, { limit: 30 });
