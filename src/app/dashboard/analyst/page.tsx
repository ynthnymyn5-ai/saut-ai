import { AnalystChat } from "@/components/os/AnalystChat";
import { requirePageSession } from "@/lib/auth";

export const metadata = { title: "AI Analyst" };

export default async function AnalystPage() {
  const s = await requirePageSession();
  return <AnalystChat demo={s.demo} />;
}
