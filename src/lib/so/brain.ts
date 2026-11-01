import "server-only";
import { providerStatus } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { classifyIntentRules, type Intent, type IntentKind } from "./router";

const KINDS: IntentKind[] = ["booking", "reschedule", "cancel", "purchase_interest", "pricing", "complaint", "support", "faq", "human_request", "report", "medical", "greeting", "other"];

/**
 * SO Brain: structured-output intent classification. Uses the model with a strict JSON schema
 * when OpenAI is configured; falls back to the rule classifier on any error.
 */
export async function understand(text: string, history: string[] = []): Promise<Intent & { source: "model" | "rules"; booking?: { date?: string; time?: string; party_size?: number } }> {
  if (!providerStatus("openai").configured) return { ...classifyIntentRules(text), source: "rules" };
  try {
    const { openai, models } = await import("@/lib/ai/openai");
    const r = await openai().chat.completions.create({
      model: models.chat(),
      temperature: 0,
      max_tokens: 150,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "intent", strict: true,
          schema: {
            type: "object", additionalProperties: false, required: ["kind", "confidence", "language", "urgent", "date", "time", "party_size"],
            properties: {
              kind: { type: "string", enum: KINDS }, confidence: { type: "number" }, language: { type: "string", enum: ["ar", "en"] }, urgent: { type: "boolean" },
              date: { type: ["string", "null"], description: "YYYY-MM-DD if a booking date is stated" }, time: { type: ["string", "null"], description: "HH:MM 24h if stated" }, party_size: { type: ["integer", "null"] },
            },
          },
        },
      },
      messages: [
        { role: "system", content: `Classify the latest customer message for a Kuwaiti business. Today is ${new Date().toISOString().slice(0, 10)} (Asia/Kuwait). "medical" = asks about symptoms, medication, diagnosis or results. "human_request" = asks for a person/manager.` },
        ...history.slice(-4).map((h) => ({ role: "user" as const, content: `(earlier) ${h}` })),
        { role: "user", content: text.slice(0, 2000) },
      ],
    });
    const j = JSON.parse(r.choices[0].message.content ?? "{}");
    return { kind: j.kind, confidence: j.confidence, language: j.language, urgent: j.urgent, source: "model", booking: j.date ? { date: j.date, time: j.time ?? undefined, party_size: j.party_size ?? undefined } : undefined };
  } catch (e) {
    reportError(e, { scope: "brain" });
    return { ...classifyIntentRules(text), source: "rules" };
  }
}
