"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Database } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** Inline bilingual string for screens added in the OS upgrade. */
export function useTr() {
  const { locale } = useI18n();
  return (en: string, ar: string) => (locale === "ar" ? ar : en);
}

/** Fetch JSON (optionally polling). Pauses while the tab is hidden to save quota. */
export function useApi<T>(url: string | null, opts: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!url) return;
    try {
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      if (!alive.current) return;
      if (!r.ok) setError(j?.error?.message ?? `Error ${r.status}`);
      else { setData(j); setError(null); }
    } catch {
      if (alive.current) setError("network");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    alive.current = true;
    load();
    if (!opts.pollMs) return () => { alive.current = false; };
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, opts.pollMs);
    return () => { alive.current = false; clearInterval(t); };
  }, [load, opts.pollMs]);
  return { data, error, loading, reload: load };
}

/** POST/PATCH/PUT/DELETE helper with toasts and honest demo-mode messaging. */
export function useMutate() {
  const toast = useToast();
  const tr = useTr();
  return async (url: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown, success?: string) => {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (j?.demo) { toast({ kind: "info", title: tr("Demo mode: nothing was saved", "وضع تجريبي: لم يُحفظ شيء") }); return null; }
    if (!r.ok) {
      const missing = j?.error?.code === "provider_not_configured" ? ` (${j.error.variable})` : "";
      toast({ kind: "error", title: (j?.error?.message ?? tr("Something went wrong", "حدث خطأ")) + missing });
      return null;
    }
    if (success) toast({ kind: "success", title: success });
    return j;
  };
}

/** Shown on live screens in demo mode instead of any simulated activity. */
export function DemoNoLive({ what }: { what: string }) {
  const tr = useTr();
  return (
    <EmptyState
      icon={<Database className="h-6 w-6" />}
      title={tr(`${what} needs a live backend`, `${what} تحتاج اتصالاً فعلياً`)}
      body={tr(
        "You're in demo mode (no Supabase keys). This screen only ever shows real activity from your database and providers, so it stays empty here instead of showing simulated data.",
        "أنت في الوضع التجريبي (بدون مفاتيح Supabase). هذه الشاشة تعرض فقط النشاط الحقيقي من قاعدة بياناتك ومزوّديك، لذلك تبقى فارغة هنا بدلاً من عرض بيانات وهمية.",
      )}
    />
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mb-4 flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-sm text-rose-200"><AlertTriangle className="h-4 w-4" />{error}</p>;
}

export const LIVE_COLORS: Record<string, string> = {
  online: "bg-emerald-400", working: "bg-electric", listening: "bg-electric", thinking: "bg-amber-300",
  speaking: "bg-violet-soft", waiting: "bg-white/50", needs_attention: "bg-rose-400", offline: "bg-white/20",
};

export function LiveDot({ status, pulse = true }: { status: string; pulse?: boolean }) {
  const active = ["working", "listening", "thinking", "speaking", "needs_attention"].includes(status);
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {active && pulse && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", LIVE_COLORS[status])} />}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", LIVE_COLORS[status] ?? "bg-white/20")} />
    </span>
  );
}

export function useStatusLabel() {
  const tr = useTr();
  const map: Record<string, [string, string]> = {
    online: ["Online", "متصل"], working: ["Working", "يعمل"], listening: ["Listening", "يستمع"], thinking: ["Thinking", "يفكّر"],
    speaking: ["Speaking", "يتحدث"], waiting: ["Waiting", "بالانتظار"], needs_attention: ["Needs attention", "يحتاج متابعة"], offline: ["Offline", "غير متصل"],
  };
  return (s: string) => (map[s] ? tr(map[s][0], map[s][1]) : s);
}

export function SourceTag({ kind }: { kind: "measured" | "estimated" | "ai" | "rules" }) {
  const tr = useTr();
  const m = { measured: ["green", tr("Measured", "مقاس")], estimated: ["amber", tr("Estimate", "تقدير")], ai: ["violet", tr("AI interpretation", "تفسير الذكاء الاصطناعي")], rules: ["blue", tr("Rule-based", "قائم على القواعد")] } as const;
  return <Badge tone={m[kind][0]}>{m[kind][1]}</Badge>;
}

export function timeAgo(iso: string, locale: "ar" | "en") {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar" : "en", { numeric: "auto" });
  if (s < 60) return rtf.format(-s, "second");
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86400), "day");
}
