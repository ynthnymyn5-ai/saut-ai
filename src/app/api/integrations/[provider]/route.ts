import crypto from "node:crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { providerStatus, publicEnv, serverEnv } from "@/lib/env";
import { fail, ok, route } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";
import { twilioClient } from "@/lib/telephony/twilio";

const PROVIDERS = ["whatsapp", "telephony", "google_calendar", "crm", "web_widget", "email", "webhooks", "api"] as const;

/**
 * Connect an integration. Status becomes "connected" ONLY after the provider has been
 * verified (credentials checked / OAuth completed). Otherwise it stays pending or errors.
 */
export const POST = route("integrations", async (req, ctx) => {
  const s = await requireApiSession(["owner", "admin"]);
  const provider = z.enum(PROVIDERS).parse((await ctx.params).provider);
  const body = z.record(z.string().max(500)).parse(await req.json().catch(() => ({})));
  if (s.demo) return ok({ demo: true, status: "disconnected", message: "Demo mode" });
  const sb = (await supabaseServer())!;

  const save = async (status: string, config: object, message: string, lastError: string | null = null) => {
    await sb.from("integrations").upsert(
      { organization_id: s.org.id, provider, status, config, last_error: lastError, connected_at: status === "connected" ? new Date().toISOString() : null },
      { onConflict: "organization_id,provider" },
    );
    await audit({ orgId: s.org.id, actorId: s.userId, action: `integration.${provider}.${status}` });
    return ok({ status, message });
  };

  switch (provider) {
    case "telephony": {
      const number = z.string().regex(/^\+[0-9]{8,15}$/).parse((body.phone_number ?? "").replace(/\s/g, ""));
      // Verify the number exists on our Twilio account before claiming it's connected.
      const list = await twilioClient().incomingPhoneNumbers.list({ phoneNumber: number, limit: 1 });
      if (!list.length) return save("error", { number }, "Number not found on the Twilio account", "number_not_found");
      await twilioClient().incomingPhoneNumbers(list[0].sid).update({
        voiceUrl: `${publicEnv.appUrl}/api/telephony/twilio/voice`,
        statusCallback: `${publicEnv.appUrl}/api/telephony/twilio/status`,
      });
      if (body.employee_id) await sb.from("ai_employees").update({ phone_number: number }).eq("id", body.employee_id).eq("organization_id", s.org.id);
      return save("connected", { number }, "Phone number connected");
    }
    case "whatsapp": {
      const token = serverEnv("WHATSAPP_ACCESS_TOKEN");
      const id = serverEnv("WHATSAPP_PHONE_NUMBER_ID");
      const r = await fetch(`https://graph.facebook.com/v21.0/${id}?fields=display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${token}` } });
      const data = (await r.json()) as { display_phone_number?: string; verified_name?: string; error?: { message: string } };
      if (!r.ok) return save("error", {}, "WhatsApp verification failed", data.error?.message ?? "error");
      return save("connected", { display: data.display_phone_number, name: data.verified_name, phone_number_id: id }, "WhatsApp connected");
    }
    case "google_calendar": {
      if (!providerStatus("google").configured) return fail(503, "provider_not_configured", "Google OAuth not configured", { variable: "GOOGLE_CLIENT_ID" });
      const state = crypto.randomBytes(16).toString("hex");
      await save("pending", { state }, "Redirecting to Google");
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        client_id: serverEnv("GOOGLE_CLIENT_ID"), redirect_uri: `${publicEnv.appUrl}/api/integrations/google/callback`, response_type: "code",
        access_type: "offline", prompt: "consent", scope: "https://www.googleapis.com/auth/calendar.events", state,
      }).toString();
      return ok({ redirect: url.toString() });
    }
    case "webhooks": {
      const url = z.string().url().refine((u) => u.startsWith("https://"), "HTTPS required").parse(body.url);
      const secret = crypto.randomBytes(24).toString("hex");
      const ping = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Saut-Signature": crypto.createHmac("sha256", secret).update("{\"type\":\"ping\"}").digest("hex") }, body: "{\"type\":\"ping\"}" }).catch(() => null);
      if (!ping?.ok) return save("error", { url }, "Endpoint did not respond with 2xx", "ping_failed");
      return save("connected", { url, secret_hint: secret.slice(0, 6) }, `Webhook verified. Signing secret: ${secret}`);
    }
    case "api": {
      const raw = `sk_saut_${crypto.randomBytes(24).toString("base64url")}`;
      const hash = crypto.createHash("sha256").update(raw).digest("hex");
      await sb.from("api_keys").insert({ organization_id: s.org.id, name: (body.key_name || "Default").slice(0, 60), prefix: raw.slice(0, 12), key_hash: hash });
      await save("connected", {}, "API key created");
      return ok({ status: "connected", message: `Copy your key now — it won't be shown again: ${raw}` });
    }
    case "web_widget": {
      const domain = z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i).parse(body.domain);
      return save("pending", { domain }, "Add the widget snippet to your site; it activates on the first verified load.");
    }
    case "email":
      if (!providerStatus("email").configured) return fail(503, "provider_not_configured", "Email provider not configured", { variable: "RESEND_API_KEY" });
      return save("connected", { reply_to: body.reply_to ?? null }, "Email sending enabled");
    case "crm":
      return save("pending", { crm: body.crm }, "CRM connector requested — OAuth for this CRM is configured per deployment.");
    default:
      return fail(400, "unknown_provider", "Unknown provider");
  }
});
