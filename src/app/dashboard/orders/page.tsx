import { OrdersView } from "@/components/dashboard/OrdersView";
import { requirePageSession } from "@/lib/auth";
import { can, MANAGE_AI, OPERATE } from "@/lib/rbac";

export const metadata = { title: "Orders" };

export default async function OrdersPage() {
  const s = await requirePageSession();
  return <OrdersView demo={s.demo} canEdit={can(s.role, OPERATE)} canManageProducts={can(s.role, MANAGE_AI)} />;
}
