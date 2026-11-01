import { can, OPERATE } from "@/lib/rbac";
import { LiveOps } from "@/components/os/LiveOps";
import { requirePageSession } from "@/lib/auth";

export const metadata = { title: "Live operations" };

export default async function LivePage() {
  const s = await requirePageSession();
  return <LiveOps canAct={can(s.role, OPERATE)} />;
}
