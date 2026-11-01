import { can, MANAGE_AI } from "@/lib/rbac";
import { CommandCenter } from "@/components/os/CommandCenter";
import { requirePageSession } from "@/lib/auth";

export const metadata = { title: "Command Center" };

export default async function CommandPage() {
  const s = await requirePageSession();
  return <CommandCenter canApprove={can(s.role, MANAGE_AI)} />;
}
