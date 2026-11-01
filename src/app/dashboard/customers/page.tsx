import { CustomersView } from "@/components/dashboard/CustomersView";
import { requirePageSession } from "@/lib/auth";
import { getCustomers } from "@/lib/data";

export const metadata = { title: "Customers" };

export default async function CustomersPage() {
  const s = await requirePageSession();
  const d = await getCustomers(s);
  return <CustomersView {...d} />;
}
