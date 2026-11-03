import { DriverView } from "@/components/dashboard/DriverView";
import { requirePageSession } from "@/lib/auth";

export const metadata = { title: "My deliveries" };

export default async function DriverPage() {
  const s = await requirePageSession();
  return <DriverView demo={s.demo} />;
}
