import { Overview } from "@/components/dashboard/Overview";
import { requirePageSession } from "@/lib/auth";
import { getOverview } from "@/lib/data";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const s = await requirePageSession();
  const d = await getOverview(s);
  return <Overview {...d} />;
}
