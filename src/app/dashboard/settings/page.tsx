import { SettingsView } from "@/components/dashboard/SettingsView";
import { requirePageSession } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const s = await requirePageSession();
  if (s.demo) {
    return (
      <SettingsView
        demo
        privacy={{ recordingEnabled: false, consentMessage: "هذه المكالمة قد تُسجَّل لتحسين جودة الخدمة. This call may be recorded.", retentionDays: 90 }}
        team={[{ name: "Demo Owner", email: "demo@saut.ai", role: "owner" }, { name: "Front desk (Demo)", email: "desk@example.com", role: "agent" }]}
      />
    );
  }
  const sb = (await supabaseServer())!;
  const [{ data: org }, { data: members }] = await Promise.all([
    sb.from("organizations").select("recording_enabled, recording_consent_msg, retention_days").eq("id", s.org.id).single(),
    sb.from("memberships").select("role, users(full_name, email)").eq("organization_id", s.org.id),
  ]);
  return (
    <SettingsView
      demo={false}
      privacy={{ recordingEnabled: org?.recording_enabled ?? false, consentMessage: org?.recording_consent_msg ?? "", retentionDays: org?.retention_days ?? 90 }}
      team={(members ?? []).map((m) => { const u = m.users as unknown as { full_name: string; email: string }; return { name: u?.full_name ?? "—", email: u?.email ?? "", role: m.role }; })}
    />
  );
}
