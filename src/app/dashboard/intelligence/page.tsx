import { Intelligence } from "@/components/os/Intelligence";
import { requirePageSession } from "@/lib/auth";

export const metadata = { title: "Business intelligence" };

export default async function IntelligencePage() {
  const s = await requirePageSession();
  return <Intelligence demo={s.demo} />;
}
