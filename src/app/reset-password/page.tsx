import { ResetPassword } from "@/components/auth/PasswordReset";

export const metadata = { title: "Choose a new password" };
export const dynamic = "force-dynamic";
export default function ResetPasswordPage() {
  return <ResetPassword />;
}
