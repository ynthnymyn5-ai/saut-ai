import { Pipeline } from "@/components/os/Pipeline";
import { requirePageSession } from "@/lib/auth";

export const metadata = { title: "Sales pipeline" };

export default async function PipelinePage() {
  const s = await requirePageSession();
  return <Pipeline demo={s.demo} />;
}
