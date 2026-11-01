import { z } from "zod";
import { getSession } from "@/lib/auth";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { createRealtimeSession } from "@/lib/ai/openai";
import { AuthError, ok, parseJson, route } from "@/lib/http";
import { VOICES, employeeSchema } from "@/lib/validation";

const schema = z.object({ employee: employeeSchema.partial().passthrough() });

/** Mints a short-lived realtime client secret. The OpenAI API key stays on the server. */
export const POST = route(
  "ai-realtime",
  async (req) => {
    const s = await getSession();
    if (!s?.org) throw new AuthError(401);
    const { employee } = await parseJson(req, schema);
    const voice = VOICES.includes(employee.voice as (typeof VOICES)[number]) ? (employee.voice as string) : "alloy";
    const session = await createRealtimeSession(buildSystemPrompt(employee) + "\nThis is a TEST voice call. Do not claim actions were performed.", voice);
    return ok({ client_secret: session.client_secret.value, expires_at: session.client_secret.expires_at, model: session.model });
  },
  { limit: 6 },
);
