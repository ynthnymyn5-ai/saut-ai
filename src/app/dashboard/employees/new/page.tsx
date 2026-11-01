import { EmployeeWizard } from "@/components/employees/Wizard";
import { requirePageSession } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";

export const metadata = { title: "Create AI employee" };

export default async function NewEmployee() {
  const s = await requirePageSession();
  const { t } = await getDict();
  return (
    <>
      <h1 className="mb-6 font-display text-2xl font-semibold">{t.dash.create}</h1>
      <EmployeeWizard demo={s.demo} />
    </>
  );
}
