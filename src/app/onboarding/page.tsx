import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/auth/OnboardingWizard";
import { getSession } from "@/lib/auth";

export const metadata = { title: "Set up your business" };
export const dynamic = "force-dynamic";

/** Signed-in users without an organization land here; everyone else is redirected. */
export default async function Onboarding() {
  const s = await getSession();
  if (!s) redirect("/login?next=/onboarding");
  if (s.org) redirect("/dashboard");
  return <OnboardingWizard email={s.email} />;
}
