import { requireApiSession } from "@/lib/auth";
import { ok, route } from "@/lib/http";
import { ANY_MEMBER } from "@/lib/rbac";
import { setupStatus } from "@/lib/setup/status";
import { supabaseServer } from "@/lib/supabase/server";

/** Getting-started checklist for the dashboard (real data, RLS-scoped). */
export const GET = route("setup-status", async () => {
  const s = await requireApiSession(ANY_MEMBER);
  if (s.demo) return ok({ demo: true });
  return ok(await setupStatus((await supabaseServer())!, s.org.id));
}, { limit: 60 });
