import { ConversationsView } from "@/components/dashboard/ConversationsView";
import { requirePageSession } from "@/lib/auth";
import { getConversations } from "@/lib/data";

export const metadata = { title: "Conversations" };

export default async function ConversationsPage() {
  const s = await requirePageSession();
  const d = await getConversations(s);
  return <ConversationsView kind="conversations" {...d} />;
}
