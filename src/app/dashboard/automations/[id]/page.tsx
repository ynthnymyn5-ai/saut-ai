import { can, MANAGE_AI } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { WorkflowEditor } from "@/components/os/WorkflowEditor";
import { requirePageSession } from "@/lib/auth";

export const metadata = { title: "Automation" };

export default async function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requirePageSession();
  if (s.demo || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <WorkflowEditor id={id} canEdit={can(s.role, MANAGE_AI)} />;
}
