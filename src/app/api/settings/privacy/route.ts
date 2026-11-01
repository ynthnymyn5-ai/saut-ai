import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { ok, parseJson, route } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";
import { privacySchema } from "@/lib/validation";

export const PUT = route("settings-privacy", async (req) => {
  const s = await requireApiSession(["owner", "admin"]);
  const p = await parseJson(req, privacySchema);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { error } = await sb.from("organizations").update({ recording_enabled: p.recordingEnabled, recording_consent_msg: p.consentMessage, retention_days: p.retentionDays }).eq("id", s.org.id);
  if (error) throw error;
  await audit({ orgId: s.org.id, actorId: s.userId, action: "privacy.updated", metadata: p });
  return ok({ ok: true });
});
