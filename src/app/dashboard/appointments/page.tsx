import { AppointmentsView } from "@/components/dashboard/AppointmentsView";
import { requirePageSession } from "@/lib/auth";
import { can, OPERATE } from "@/lib/rbac";

export const metadata = { title: "Appointments" };

export default async function AppointmentsPage() {
  const s = await requirePageSession();
  return <AppointmentsView demo={s.demo} canEdit={can(s.role, OPERATE)} />;
}
