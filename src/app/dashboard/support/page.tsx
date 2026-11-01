import { SupportForm } from "@/components/dashboard/SupportForm";
import { requirePageSession } from "@/lib/auth";

export const metadata = { title: "Support" };

export default async function SupportPage() {
  const s = await requirePageSession();
  return <SupportForm demo={s.demo} />;
}
