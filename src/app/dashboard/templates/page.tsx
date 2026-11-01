import { can, MANAGE_AI } from "@/lib/rbac";
import { Templates } from "@/components/os/Templates";
import { requirePageSession } from "@/lib/auth";

export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const s = await requirePageSession();
  return <Templates canCreate={can(s.role, MANAGE_AI)} demo={s.demo} />;
}
