import { requirePageAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Role-based gate: only users with platform_role = 'admin' reach any /admin page. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePageAdmin();
  return children;
}
