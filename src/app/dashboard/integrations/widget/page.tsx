import { WidgetSetup } from "@/components/dashboard/WidgetSetup";
import { requirePageSession } from "@/lib/auth";
import { can, MANAGE_ORG } from "@/lib/rbac";

export const metadata = { title: "Website chat widget" };

export default async function WidgetPage() {
  const s = await requirePageSession();
  return <WidgetSetup demo={s.demo} canEdit={can(s.role, MANAGE_ORG)} />;
}
