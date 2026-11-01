/**
 * Central place to read configuration. Server-only secrets are read lazily so that
 * a missing provider never crashes the app — it just reports "not configured".
 */
export const publicEnv = {
  // Explicit URL wins; on Vercel fall back to the project's production domain (system env var).
  appUrl: process.env.NEXT_PUBLIC_APP_URL
    || (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}` : "")
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
    || "http://localhost:3000",
  currency: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY ?? "KWD",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  demoMode: (process.env.NEXT_PUBLIC_DEMO_MODE ?? "true") === "true",
};

export const isSupabaseConfigured = () => Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);

/** True when the app should render clearly-labelled demo data instead of database data. */
export const isDemo = () => !isSupabaseConfigured() && publicEnv.demoMode;

type ProviderKey = "openai" | "twilio" | "whatsapp" | "stripe" | "myfatoorah" | "google" | "email";

const required: Record<ProviderKey, string[]> = {
  openai: ["OPENAI_API_KEY"],
  twilio: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"],
  whatsapp: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  myfatoorah: ["MYFATOORAH_API_KEY", "MYFATOORAH_BASE_URL"],
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  email: ["RESEND_API_KEY"],
};

export function providerStatus(key: ProviderKey) {
  const missing = required[key].filter((k) => !process.env[k]);
  return { configured: missing.length === 0, missing };
}

export function allProviderStatus() {
  return Object.fromEntries(
    (Object.keys(required) as ProviderKey[]).map((k) => [k, providerStatus(k)]),
  ) as Record<ProviderKey, { configured: boolean; missing: string[] }>;
}

export function serverEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new ProviderNotConfiguredError(name);
  return v;
}

export class ProviderNotConfiguredError extends Error {
  constructor(public variable: string) {
    super(`Provider not configured: missing ${variable}`);
    this.name = "ProviderNotConfiguredError";
  }
}
