/**
 * Central place for configuration. Every secret comes from the environment
 * (Replit Secrets in production, .env locally) — never hard-code keys.
 */
import "dotenv/config";

const str = (k: string, d = "") => (process.env[k] ?? d).trim();

function validTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * ANTHROPIC_API_KEY, or — when a dashboard saved the key under an
 * auto-generated variable name — any variable whose value is an Anthropic key.
 */
function anthropicKey() {
  const named = str("ANTHROPIC_API_KEY");
  if (named) return named;
  for (const v of Object.values(process.env)) if (v && /^sk-ant-[\w-]{20,}$/.test(v.trim())) return v.trim();
  return "";
}

function ownerTimeZone() {
  const explicit = str("OWNER_TZ");
  if (explicit && validTimeZone(explicit)) return explicit;
  const tz = str("TZ").replace(/^:/, "");
  // ":UTC" / "UTC" is the platform default, not a choice by the owner
  if (tz && tz !== "UTC" && validTimeZone(tz)) return tz;
  return "Asia/Kuwait";
}

export const env = {
  NODE_ENV: str("NODE_ENV", "development"),
  isProd: str("NODE_ENV") === "production",
  PORT: Number(str("PORT", "5000")),
  DATABASE_URL: str("DATABASE_URL"),
  SESSION_SECRET: str("SESSION_SECRET", "dev-only-insecure-secret"),
  APP_URL: str("APP_URL") || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : ""),

  // Auth (Replit Auth = OpenID Connect against replit.com/oidc)
  REPL_ID: str("REPL_ID"),
  ISSUER_URL: str("ISSUER_URL", "https://replit.com/oidc"),
  OWNER_EMAIL: str("OWNER_EMAIL").toLowerCase(),
  /** Explicit opt-out for local development only. Ignored when REPL_ID is set. */
  AUTH_DISABLED: str("AUTH_DISABLED") === "true",
  /** Single-owner password login (used where Replit Auth isn't available, e.g. Vercel) */
  OWNER_PASSWORD: str("OWNER_PASSWORD"),
  /** Bearer secret for /api/cron/tick (scheduler on serverless hosts) */
  CRON_SECRET: str("CRON_SECRET"),

  // AI — Claude (preferred when set) and/or OpenAI
  LLM_PROVIDER: str("LLM_PROVIDER").toLowerCase(),
  ANTHROPIC_API_KEY: anthropicKey(),
  ANTHROPIC_MODEL: str("ANTHROPIC_MODEL", "claude-opus-5-5"),
  /** low | medium | high | xhigh | max — Opus 5.5 defaults to medium */
  ANTHROPIC_EFFORT: str("ANTHROPIC_EFFORT", "medium"),
  OPENAI_API_KEY: str("OPENAI_API_KEY"),
  OPENAI_MODEL: str("OPENAI_MODEL", "gpt-4o"),
  OPENAI_FAST_MODEL: str("OPENAI_FAST_MODEL", "gpt-4o-mini"),
  OPENAI_EMBED_MODEL: str("OPENAI_EMBED_MODEL", "text-embedding-3-small"),
  OPENAI_STT_MODEL: str("OPENAI_STT_MODEL", "whisper-1"),
  OPENAI_TTS_MODEL: str("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
  OPENAI_TTS_VOICE: str("OPENAI_TTS_VOICE", "shimmer"),
  OPENAI_REALTIME_MODEL: str("OPENAI_REALTIME_MODEL", "gpt-realtime"),
  OPENAI_REALTIME_VOICE: str("OPENAI_REALTIME_VOICE", str("OPENAI_TTS_VOICE", "shimmer")),
  TAVILY_API_KEY: str("TAVILY_API_KEY"),

  // Integrations
  GOOGLE_CLIENT_ID: str("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: str("GOOGLE_CLIENT_SECRET"),
  TELEGRAM_BOT_TOKEN: str("TELEGRAM_BOT_TOKEN"),
  TELEGRAM_OWNER_CHAT_ID: str("TELEGRAM_OWNER_CHAT_ID"),
  WHATSAPP_TOKEN: str("WHATSAPP_TOKEN"),
  WHATSAPP_PHONE_NUMBER_ID: str("WHATSAPP_PHONE_NUMBER_ID"),
  WHATSAPP_VERIFY_TOKEN: str("WHATSAPP_VERIFY_TOKEN"),
  WHATSAPP_OWNER_NUMBER: str("WHATSAPP_OWNER_NUMBER").replace(/\D/g, ""),
  NOTION_TOKEN: str("NOTION_TOKEN"),

  // Push + brief
  VAPID_PUBLIC_KEY: str("VAPID_PUBLIC_KEY"),
  VAPID_PRIVATE_KEY: str("VAPID_PRIVATE_KEY"),
  VAPID_SUBJECT: str("VAPID_SUBJECT", "mailto:owner@example.com"),
  BRIEF_HOUR: Number(str("BRIEF_HOUR", "7")),
  /** Owner timezone. OWNER_TZ wins; hosts like Vercel force TZ=":UTC" for the process, which is ignored. */
  TZ: ownerTimeZone(),
  CURRENCY: str("CURRENCY", "KWD"),
  BUSINESS_NAME: str("BUSINESS_NAME", "Noor Studio"),
  BUSINESS_DETAILS: str("BUSINESS_DETAILS", "Kuwait City, Kuwait"),
  /** automatic follow-up drafts for leads whose follow-up date has passed */
  AUTO_FOLLOWUPS: str("AUTO_FOLLOWUPS", "true") !== "false",
};

/** Public base URL used for OAuth callbacks and webhooks. */
export function baseUrl(reqHost?: string, proto = "https") {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  return reqHost ? `${proto}://${reqHost}` : `http://localhost:${env.PORT}`;
}
