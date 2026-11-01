import { EmployeeList } from "@/components/employees/EmployeeList";
import { requirePageSession } from "@/lib/auth";
import { getBilling, getEmployees } from "@/lib/data";

export const metadata = { title: "AI employees" };

export default async function EmployeesPage() {
  const s = await requirePageSession();
  const [{ employees, demo }, billing] = await Promise.all([getEmployees(s), getBilling(s)]);
  return <EmployeeList employees={employees} demo={demo} limit={billing.usage.employeeLimit} />;
}
