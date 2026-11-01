import { Suspense } from "react";
import { BillingView } from "@/components/dashboard/BillingView";
import { requirePageSession } from "@/lib/auth";
import { getBilling } from "@/lib/data";
import { providerStatus } from "@/lib/env";

export const metadata = { title: "Billing" };

export default async function BillingPage() {
  const s = await requirePageSession();
  const d = await getBilling(s);
  return (
    <Suspense>
      <BillingView {...d} providers={{ stripe: providerStatus("stripe").configured, myfatoorah: providerStatus("myfatoorah").configured }} />
    </Suspense>
  );
}
