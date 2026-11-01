import { ok, route } from "@/lib/http";
import { orgContext } from "@/lib/so/api";
import { commandSnapshot } from "@/lib/so/command";

export const dynamic = "force-dynamic";

/** Command Center snapshot (polled). Demo mode returns no live data — never simulated activity. */
export const GET = route("so-command", async () => {
  const c = await orgContext();
  if (c.demo) return ok({ demo: true, live: false });
  return ok(await commandSnapshot(c.db, c.s.org.id, { branchIds: c.branchIds, canSeeCustomer: c.canSeeCustomer }));
}, { limit: 60 });
