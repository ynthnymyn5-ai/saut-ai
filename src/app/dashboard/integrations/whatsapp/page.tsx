import { WhatsAppSetup } from "@/components/dashboard/WhatsAppSetup";
import { requirePageSession } from "@/lib/auth";

export const metadata = { title: "Connect WhatsApp" };

export default async function WhatsAppSetupPage() {
  await requirePageSession();
  return <WhatsAppSetup />;
}
