import { notFound } from "next/navigation";
import { EmployeeDetail } from "@/components/employees/EmployeeDetail";
import { requirePageSession } from "@/lib/auth";
import { demoEmployees } from "@/lib/demo-data";
import { supabaseServer } from "@/lib/supabase/server";

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requirePageSession();
  if (s.demo) {
    const e = demoEmployees.find((x) => x.id === id);
    if (!e) notFound();
    return <EmployeeDetail emp={e} demo />;
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = (await supabaseServer())!;
  const { data: e } = await sb.from("ai_employees").select("id, name, industry, dialect, voice, status, business_info").eq("id", id).eq("organization_id", s.org.id).maybeSingle();
  if (!e) notFound();
  return <EmployeeDetail demo={false} emp={{ ...e, hue: 265, businessName: (e.business_info as { businessName?: string })?.businessName }} />;
}
