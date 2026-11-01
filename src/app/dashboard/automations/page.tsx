import { can, MANAGE_AI } from "@/lib/rbac";
import { AutomationStudio } from "@/components/os/AutomationStudio";
import { requirePageSession } from "@/lib/auth";

export const metadata = { title: "Automation Studio" };

export default async function AutomationsPage() {
  const s = await requirePageSession();
  return <AutomationStudio canEdit={can(s.role, MANAGE_AI)} demo={s.demo} />;
}
