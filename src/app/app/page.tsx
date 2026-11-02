import { AppSplash } from "@/components/brand/AppSplash";

export const metadata = { title: "SAUT AI" };

/** Launch screen of the Android/iOS app (Capacitor server.url): shows SO, then opens the dashboard. */
export default function AppLaunch() {
  return <AppSplash />;
}
