import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePageSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePageSession();
  return (
    <DashboardShell orgName={s.org.name} userName={s.fullName ?? s.email} isAdmin={s.platformRole === "admin"} demo={s.demo}>
      {children}
    </DashboardShell>
  );
}
