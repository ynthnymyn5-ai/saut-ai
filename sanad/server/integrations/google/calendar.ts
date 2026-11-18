/**
 * Google Calendar plugin. When Google isn't connected the same tools work on
 * Sanad's local calendar (seeded sample events), and replies say so.
 */
import { z } from "zod";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db, schema } from "../../db";
import { defineTool, L } from "../../tools/types";
import { addDays, startOfDay, toDate, TZ } from "../../lib/time";
import type { IntegrationPlugin } from "../types";
import { googleConfigured, googleFetch, googleScopes, googleDisconnect, googleRoutes } from "./auth";
import { getAccount } from "../store";

export interface CalEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  location?: string | null;
  attendees?: string[];
  source: "google" | "local";
}

async function useGoogle() {
  return googleConfigured() && (await googleScopes()).some((s) => s.includes("calendar"));
}

const fmtTime = (iso: string, lang: "en" | "ar") =>
  new Intl.DateTimeFormat(lang === "ar" ? "ar-KW" : "en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** List events between two instants from Google or the local calendar. */
export async function listEvents(from: Date, to: Date): Promise<CalEvent[]> {
  if (await useGoogle()) {
    const params = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "50" });
    const data = await googleFetch<{ items: { id: string; summary?: string; start: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; location?: string; attendees?: { email: string }[] }[] }>(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    );
    return data.items.map((e) => ({
      id: e.id,
      title: e.summary ?? "(no title)",
      start: e.start.dateTime ?? `${e.start.date}T00:00:00`,
      end: e.end?.dateTime ?? e.end?.date,
      location: e.location ?? null,
      attendees: e.attendees?.map((a) => a.email) ?? [],
      source: "google",
    }));
  }
  const rows = await db
    .select()
    .from(schema.calendarEvents)
    .where(and(gte(schema.calendarEvents.startAt, from), lt(schema.calendarEvents.startAt, to)))
    .orderBy(asc(schema.calendarEvents.startAt));
  return rows.map((r) => ({ id: String(r.id), title: r.title, start: r.startAt.toISOString(), end: r.endAt?.toISOString(), location: r.location, attendees: r.attendees, source: "local" }));
}

function rangeBounds(range: string | null | undefined, from?: string | null, to?: string | null) {
  const today = startOfDay();
  switch (range) {
    case "tomorrow":
      return [addDays(today, 1), addDays(today, 2)];
    case "week":
      return [today, addDays(today, 7)];
    case "custom":
      return [toDate(from) ?? today, toDate(to) ?? addDays(today, 7)];
    default:
      return [today, addDays(today, 1)];
  }
}

const listTool = defineTool({
  name: "calendar_list_events",
  description: "List calendar events (meetings) for today, tomorrow, the next 7 days, or a custom range.",
  agents: ["chief", "operations"],
  schema: z.object({ range: z.enum(["today", "tomorrow", "week", "custom"]).nullish(), from: z.string().nullish(), to: z.string().nullish() }),
  summarize: (_a, lang) => L(lang, "Read calendar", "قراءة التقويم"),
  async run(a, ctx) {
    const [from, to] = rangeBounds(a.range, a.from, a.to);
    const events = await listEvents(from, to);
    const label = a.range === "tomorrow" ? L(ctx.lang, "tomorrow", "غداً") : a.range === "week" ? L(ctx.lang, "this week", "هذا الأسبوع") : L(ctx.lang, "today", "اليوم");
    const lines = events.map((e) => `• ${fmtTime(e.start, ctx.lang)} — ${e.title}${e.location ? ` (${e.location})` : ""}`).join("\n");
    const src = events[0]?.source === "local" || !(await useGoogle()) ? L(ctx.lang, " (local calendar — connect Google in Settings for your real one)", " (التقويم المحلي)") : "";
    return {
      events,
      say: events.length ? L(ctx.lang, `You have ${events.length} meeting(s) ${label}${src}:\n${lines}`, `لديك ${events.length} اجتماع ${label}${src}:\n${lines}`) : L(ctx.lang, `No meetings ${label}${src}.`, `لا توجد اجتماعات ${label}${src}.`),
    };
  },
});

const createTool = defineTool({
  name: "calendar_create_event",
  description: "Create a calendar event. Invites attendees if emails are given. Requires owner confirmation.",
  agents: ["chief", "operations"],
  confirm: true,
  mutates: true,
  schema: z.object({
    title: z.string(),
    start: z.string().describe("ISO-8601 with offset"),
    end: z.string().nullish(),
    location: z.string().nullish(),
    attendees: z.array(z.string()).nullish(),
    description: z.string().nullish(),
  }),
  summarize: (a, lang) => {
    const d = toDate(a.start);
    return L(lang, `Create event “${a.title}”${d ? ` on ${fmtTime(d.toISOString(), "en")}` : ""}${a.attendees?.length ? ` and invite ${a.attendees.join(", ")}` : ""}`, `إنشاء موعد «${a.title}»${d ? ` ${fmtTime(d.toISOString(), "ar")}` : ""}`);
  },
  async run(a, ctx) {
    const start = toDate(a.start);
    if (!start) return { say: L(ctx.lang, "Invalid start time.", "وقت البداية غير صالح.") };
    const end = toDate(a.end) ?? new Date(start.getTime() + 3600_000);
    if (await useGoogle()) {
      const ev = await googleFetch<{ id: string; htmlLink: string }>("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all", {
        method: "POST",
        body: JSON.stringify({
          summary: a.title,
          location: a.location ?? undefined,
          description: a.description ?? undefined,
          start: { dateTime: start.toISOString(), timeZone: TZ },
          end: { dateTime: end.toISOString(), timeZone: TZ },
          attendees: a.attendees?.map((email) => ({ email })),
        }),
      });
      return { id: ev.id, link: ev.htmlLink, say: L(ctx.lang, `Added “${a.title}” to Google Calendar.`, `أضفت «${a.title}» إلى تقويم Google.`) };
    }
    const [ev] = await db.insert(schema.calendarEvents).values({ title: a.title, startAt: start, endAt: end, location: a.location ?? null, attendees: a.attendees ?? [], description: a.description ?? null }).returning();
    return { id: ev.id, say: L(ctx.lang, `Added “${a.title}” to your local calendar.`, `أضفت «${a.title}» إلى التقويم المحلي.`) };
  },
});

const updateTool = defineTool({
  name: "calendar_update_event",
  description: "Move or edit a calendar event (use the id from calendar_list_events). Requires owner confirmation.",
  agents: ["chief", "operations"],
  confirm: true,
  mutates: true,
  schema: z.object({ id: z.string(), title: z.string().nullish(), start: z.string().nullish(), end: z.string().nullish(), location: z.string().nullish() }),
  summarize: (a, lang) => L(lang, `Update event ${a.title ? `“${a.title}”` : a.id}${a.start ? ` → ${a.start}` : ""}`, `تعديل الموعد ${a.title ?? a.id}`),
  async run(a, ctx) {
    const start = toDate(a.start);
    const end = toDate(a.end) ?? (start ? new Date(start.getTime() + 3600_000) : null);
    if (await useGoogle()) {
      await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(a.id)}?sendUpdates=all`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(a.title ? { summary: a.title } : {}),
          ...(a.location ? { location: a.location } : {}),
          ...(start ? { start: { dateTime: start.toISOString(), timeZone: TZ } } : {}),
          ...(end ? { end: { dateTime: end.toISOString(), timeZone: TZ } } : {}),
        }),
      });
    } else {
      const patch: Partial<typeof schema.calendarEvents.$inferInsert> = {};
      if (a.title) patch.title = a.title;
      if (a.location) patch.location = a.location;
      if (start) patch.startAt = start;
      if (end) patch.endAt = end;
      await db.update(schema.calendarEvents).set(patch).where(eq(schema.calendarEvents.id, Number(a.id)));
    }
    return { say: L(ctx.lang, "Event updated.", "تم تعديل الموعد.") };
  },
});

const deleteTool = defineTool({
  name: "calendar_delete_event",
  description: "Cancel/delete a calendar event. Requires owner confirmation.",
  agents: ["chief", "operations"],
  confirm: true,
  mutates: true,
  schema: z.object({ id: z.string(), title: z.string().nullish() }),
  summarize: (a, lang) => L(lang, `Cancel event ${a.title ? `“${a.title}”` : a.id}`, `إلغاء الموعد ${a.title ?? a.id}`),
  async run(a, ctx) {
    if (await useGoogle()) await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(a.id)}?sendUpdates=all`, { method: "DELETE" });
    else await db.delete(schema.calendarEvents).where(eq(schema.calendarEvents.id, Number(a.id)));
    return { say: L(ctx.lang, "Event cancelled.", "تم إلغاء الموعد.") };
  },
});

export const googleCalendarPlugin: IntegrationPlugin = {
  id: "google_calendar",
  name: "Google Calendar",
  description: "Read your schedule and create or move events.",
  category: "calendar",
  requiredSecrets: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  connectUrl: "/api/integrations/google/connect",
  async status() {
    if (!googleConfigured()) return { configured: false, connected: false, detail: "Using local calendar with sample events." };
    const acc = await getAccount("google");
    if (!acc || !(await useGoogle())) return { configured: true, connected: false, detail: "Click Connect to sign in with Google." };
    try {
      await googleFetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1");
      return { configured: true, connected: true, account: acc.accountLabel ?? undefined };
    } catch (e) {
      return { configured: true, connected: false, detail: (e as Error).message };
    }
  },
  disconnect: googleDisconnect,
  tools: [listTool, createTool, updateTool, deleteTool],
  routes: googleRoutes,
};
