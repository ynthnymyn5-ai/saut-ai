import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { ANY_MEMBER, MANAGE_AI, MANAGE_ORG } from "@/lib/rbac";
import { shapeVoices, VOICE_ID, type VoicePair } from "@/lib/assistant/voices";
import { supabaseServer } from "@/lib/supabase/server";

const voice = z.string().regex(VOICE_ID).nullable();
const putSchema = z.union([
  z.object({ scope: z.literal("organization"), voice_ar: voice, voice_en: voice }),
  z.object({ scope: z.literal("employee"), employee_id: z.string().uuid(), voice_ar: voice, voice_en: voice }),
]);

/** Voices screen: the account's ElevenLabs voices + the business and per-employee choices. */
export const GET = route("voices", async () => {
  const s = await requireApiSession(ANY_MEMBER);
  const key = process.env.ELEVENLABS_API_KEY;
  let voices: ReturnType<typeof shapeVoices> = [];
  let providerError: string | null = null;
  if (key) {
    const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(10_000), cache: "no-store" }).catch(() => null);
    if (r?.ok) voices = shapeVoices(await r.json());
    else providerError = r ? `ElevenLabs ${r.status}` : "ElevenLabs unreachable";
  }
  const defaults = { voice_ar: process.env.ELEVENLABS_VOICE_AR ?? null, voice_en: process.env.ELEVENLABS_VOICE_EN ?? null };
  if (s.demo) return ok({ demo: true, configured: !!key, voices, defaults, organization: {}, employees: [], canEditOrg: false, canEditEmployees: false, migrationNeeded: false, providerError });

  const sb = (await supabaseServer())!;
  const [{ data: org, error: orgErr }, { data: emps }] = await Promise.all([
    sb.from("organizations").select("voice_settings").eq("id", s.org.id).maybeSingle(),
    sb.from("ai_employees").select("id, name, call_settings").eq("organization_id", s.org.id).order("created_at"),
  ]);
  return ok({
    configured: !!key, voices, defaults, providerError,
    migrationNeeded: !!orgErr, // migration 0010 not applied yet
    organization: (org?.voice_settings as VoicePair | null) ?? {},
    employees: (emps ?? []).map((e) => ({ id: e.id, name: e.name, voice_ar: (e.call_settings as VoicePair)?.voice_ar ?? null, voice_en: (e.call_settings as VoicePair)?.voice_en ?? null })),
    canEditOrg: !!s.role && MANAGE_ORG.includes(s.role),
    canEditEmployees: !!s.role && MANAGE_AI.includes(s.role),
  });
}, { limit: 30 });

export const PUT = route("voices-save", async (req) => {
  const body = await parseJson(req, putSchema);
  const s = await requireApiSession(body.scope === "organization" ? MANAGE_ORG : MANAGE_AI);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const pair = { voice_ar: body.voice_ar, voice_en: body.voice_en };
  if (body.scope === "organization") {
    const { data: cur } = await sb.from("organizations").select("voice_settings").eq("id", s.org.id).maybeSingle();
    const { error } = await sb.from("organizations").update({ voice_settings: { ...((cur?.voice_settings as object) ?? {}), ...pair } }).eq("id", s.org.id);
    if (error) return fail(409, "migration_needed", "Run supabase/migrations/0010_voice_settings.sql in Supabase first.");
  } else {
    const { data: emp } = await sb.from("ai_employees").select("call_settings").eq("id", body.employee_id).eq("organization_id", s.org.id).maybeSingle();
    if (!emp) return fail(404, "not_found", "AI employee not found");
    const { error } = await sb.from("ai_employees").update({ call_settings: { ...((emp.call_settings as object) ?? {}), ...pair } }).eq("id", body.employee_id).eq("organization_id", s.org.id);
    if (error) throw error;
  }
  await audit({ orgId: s.org.id, actorId: s.userId, action: `voices.${body.scope}_updated`, metadata: body });
  return ok({ ok: true });
}, { limit: 20 });
