import { ConversationsView } from "@/components/dashboard/ConversationsView";
import { InboxView } from "@/components/dashboard/InboxView";
import { requirePageSession } from "@/lib/auth";
import { getConversations } from "@/lib/data";
import { can, OPERATE } from "@/lib/rbac";

export const metadata = { title: "Conversations" };

export default async function ConversationsPage() {
  const s = await requirePageSession();
  if (!s.demo) return <InboxView canOperate={can(s.role, OPERATE)} />;
  const d = await getConversations(s); // demo mode: clearly-labelled sample data
  return <ConversationsView kind="conversations" {...d} />;
}
