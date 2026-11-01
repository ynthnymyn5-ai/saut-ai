import { Branches } from "@/components/os/Branches";
import { requirePageSession } from "@/lib/auth";

export const metadata = { title: "Branches" };

export default async function BranchesPage() {
  const s = await requirePageSession();
  return <Branches canEdit={s.role === "owner" || s.role === "admin"} demo={s.demo} />;
}
