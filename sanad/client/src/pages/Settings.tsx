/** Settings: integrations status, AI/voice, language, notifications, brief, account. */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Mail, Send, Smartphone, FileText, CheckCircle2, CircleDashed, KeyRound, Bell, Cpu, Languages, Sun, LogOut, Download } from "lucide-react";
import type { IntegrationStatusDTO } from "@shared/types";
import { api } from "../lib/api";
import { useData, useSanad } from "../lib/store";
import { useI18n } from "../i18n";
import { Card, SectionTitle, Spinner, cx } from "../components/ui";
import { currentSubscription, disablePush, enablePush, pushSupported } from "../lib/push";

const ICONS: Record<string, typeof Mail> = { google_calendar: CalendarDays, gmail: Mail, telegram: Send, whatsapp: Smartphone, notion: FileText };

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-3 py-2 text-sm">
      <span className="text-start text-zinc-200">{label}</span>
      <span className={cx("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-neon-purple shadow-glow" : "bg-white/10")}>
        <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", on ? "start-[22px]" : "start-0.5")} />
      </span>
    </button>
  );
}

export function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const { status, prefs, setPref, toast, user, authMode } = useSanad();
  const [integrations, reload, loading] = useData(() => api.get<IntegrationStatusDTO[]>("/api/integrations"));
  const [params, setParams] = useSearchParams();
  const [push, setPush] = useState<"on" | "off" | "denied" | "unsupported">("off");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!pushSupported()) return setPush("unsupported");
    if (Notification.permission === "denied") return setPush("denied");
    currentSubscription().then((s) => setPush(s ? "on" : "off"));
  }, []);

  useEffect(() => {
    const g = params.get("google");
    if (g) {
      toast(g === "connected" ? "Google connected ✓" : `Google: ${params.get("reason") ?? "error"}`, g === "connected" ? "success" : "error");
      setParams({}, { replace: true });
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async (i: IntegrationStatusDTO) => {
    if (i.connectUrl) {
      window.location.href = i.connectUrl;
      return;
    }
    setBusy(i.id);
    try {
      const r = await api.post<{ ok: boolean; detail: string }>(`/api/integrations/${i.id}/connect`);
      toast(r.detail, r.ok ? "success" : "error");
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (i: IntegrationStatusDTO) => {
    setBusy(i.id);
    await api.post(`/api/integrations/${i.id}/disconnect`).catch((e) => toast((e as Error).message, "error"));
    setBusy(null);
    reload();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 pt-6 md:px-8 md:pt-10">
      <h1 className="text-xl font-semibold">{t.settings.title}</h1>

      {/* Integrations */}
      <section>
        <SectionTitle action={loading ? <Spinner /> : null}>{t.settings.integrations}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {integrations?.map((i) => {
            const I = ICONS[i.id] ?? FileText;
            const state = i.connected ? "connected" : i.configured ? "notConnected" : "needsSecrets";
            return (
              <Card key={i.id} className="flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5"><I className="h-5 w-5 text-violet-200" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{i.name}</p>
                      <span className={cx("chip", state === "connected" ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : state === "notConnected" ? "border-orange-400/40 bg-orange-500/10 text-orange-200" : "border-zinc-500/30 text-zinc-400")}>
                        {state === "connected" ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                        {t.settings[state]}
                      </span>
                    </div>
                    <p dir="auto" className="mt-0.5 text-xs text-zinc-400">{i.description}</p>
                    {i.account && <p className="mt-1 text-xs text-zinc-300">{i.account}</p>}
                    {i.detail && <p dir="auto" className="mt-1 text-[11px] text-zinc-500">{i.detail}</p>}
                  </div>
                </div>
                {!i.configured && (
                  <div className="mt-3 flex flex-wrap items-center gap-1 text-[10px] text-zinc-500">
                    <KeyRound className="h-3 w-3" /> {t.settings.secrets}:
                    {i.requiredSecrets.map((s) => <code key={s} className="rounded bg-black/40 px-1.5 py-0.5 text-zinc-300">{s}</code>)}
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  {i.configured && !i.connected && (i.connectUrl || ["telegram"].includes(i.id)) && (
                    <button className="btn-primary px-3 py-1.5 text-xs" disabled={busy === i.id} onClick={() => connect(i)}>
                      {busy === i.id ? <Spinner /> : t.settings.connect}
                    </button>
                  )}
                  {i.connected && i.canDisconnect && (
                    <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy === i.id} onClick={() => disconnect(i)}>{t.settings.disconnect}</button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {/* AI & voice */}
        <Card className="p-4">
          <SectionTitle icon={<Cpu className="h-4 w-4 text-violet-300" />}>{t.settings.ai}</SectionTitle>
          <dl className="space-y-2 text-sm">
            {[
              [t.settings.provider, status?.provider],
              [t.settings.serverVoice, status?.serverVoice ? t.settings.yes : `${t.settings.no} — ${t.settings.browserVoice}`],
              [t.settings.webSearch, status?.webSearch ? t.settings.yes : `${t.settings.no} (TAVILY_API_KEY)`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-zinc-400">{k}</dt>
                <dd className="text-end text-zinc-200">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 border-t border-white/5 pt-2">
            <Toggle on={prefs.wakeWord} onChange={(v) => setPref("wakeWord", v)} label={t.voice.wakeWord} />
            <Toggle on={prefs.autoSpeak} onChange={(v) => setPref("autoSpeak", v)} label={t.voice.autoSpeak} />
          </div>
        </Card>

        {/* Language */}
        <Card className="p-4">
          <SectionTitle icon={<Languages className="h-4 w-4 text-violet-300" />}>{t.settings.language}</SectionTitle>
          <p className="mb-2 text-xs text-zinc-400">{t.settings.uiLanguage}</p>
          <div className="flex gap-2">
            {(["en", "ar"] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)} className={cx("btn flex-1 border", lang === l ? "border-neon-purple/60 bg-neon-purple/15 text-white" : "border-white/10 bg-white/5 text-zinc-400")}>
                {l === "en" ? "English" : "العربية"}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-zinc-500">{lang === "ar" ? "سند يرد دائماً باللغة التي تتحدث بها." : "Sanad always replies in the language you speak to him in."}</p>
        </Card>

        {/* Notifications */}
        <Card className="p-4">
          <SectionTitle icon={<Bell className="h-4 w-4 text-violet-300" />}>{t.settings.notifications}</SectionTitle>
          {push === "unsupported" ? (
            <p className="text-sm text-zinc-400">{t.voice.unsupported.replace("Voice input", "Push")}</p>
          ) : push === "denied" ? (
            <p className="text-sm text-orange-200">{t.settings.pushBlocked}</p>
          ) : (
            <>
              <Toggle
                on={push === "on"}
                label={push === "on" ? t.settings.pushOn : t.settings.enablePush}
                onChange={async (v) => {
                  if (v) {
                    const r = await enablePush().catch(() => "denied" as const);
                    setPush(r === "granted" ? "on" : r === "denied" ? "denied" : "unsupported");
                  } else {
                    await disablePush();
                    setPush("off");
                  }
                }}
              />
              {push === "on" && (
                <button
                  className="btn-ghost mt-2 text-xs"
                  onClick={async () => {
                    const r = await api.post<{ delivered: number }>("/api/push/test");
                    toast(`✓ ${r.delivered}`, "success");
                  }}
                >
                  {t.settings.testPush}
                </button>
              )}
            </>
          )}
          <p className="mt-3 flex items-start gap-2 text-[11px] text-zinc-500"><Download className="mt-0.5 h-3 w-3 shrink-0" /> {t.settings.install}</p>
        </Card>

        {/* Brief + account */}
        <Card className="p-4">
          <SectionTitle icon={<Sun className="h-4 w-4 text-orange-300" />}>{t.settings.brief}</SectionTitle>
          <p className="text-sm text-zinc-300">{status ? t.settings.briefAt(status.briefHour, status.timezone) : "…"}</p>
          <p className="mt-1 text-[11px] text-zinc-500">BRIEF_HOUR · TZ</p>
          <button
            className="btn-ghost mt-3 text-xs"
            onClick={async () => {
              await api.post("/api/brief/send");
              toast("✓", "success");
            }}
          >
            {t.settings.sendBriefNow}
          </button>
          <div className="mt-4 border-t border-white/5 pt-3">
            <p className="label mb-1">{t.settings.account}</p>
            <p className="text-sm text-zinc-300">{user?.name ?? user?.email ?? "Owner"} <span className="text-xs text-zinc-500">({authMode})</span></p>
            {authMode === "replit" && (
              <a href="/api/logout" className="btn-ghost mt-2 text-xs">
                <LogOut className="h-3.5 w-3.5" /> {t.settings.logout}
              </a>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
