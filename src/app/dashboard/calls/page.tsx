import { ConversationsView } from "@/components/dashboard/ConversationsView";
import { requirePageSession } from "@/lib/auth";
import { getConversations } from "@/lib/data";

export const metadata = { title: "Calls" };

export default async function CallsPage() {
  const s = await requirePageSession();
  const d = await getConversations(s, "phone");
  return <ConversationsView kind="calls" {...d} />;
}
