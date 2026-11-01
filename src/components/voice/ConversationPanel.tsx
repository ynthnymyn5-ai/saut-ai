"use client";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Mic, PhoneForwarded, Send, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SoMascot, type VoiceState } from "@/components/brand/SoMascot";
import { Soundwave } from "@/components/brand/Soundwave";
import { Badge } from "@/components/ui/primitives";
import { scriptedReply } from "@/lib/demo-script";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

/**
 * Text + browser-voice conversation with an AI employee.
 * - mode "simulated": scripted replies, always badged as simulated (landing page).
 * - mode "live": calls /api/ai/chat (OpenAI). If the server reports the provider isn't
 *   configured, it says so and offers an explicitly-labelled simulation instead.
 */
export function ConversationPanel({
  mode, employee, employeeId, compact, hue = 265, onStateChange,
}: {
  mode: "simulated" | "live";
  employee?: Record<string, unknown>;
  employeeId?: string;
  compact?: boolean;
  hue?: number;
  onStateChange?: (s: VoiceState) => void;
}) {
  const { t, locale } = useI18n();
  const [state, setStateRaw] = useState<VoiceState>("idle");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [speak, setSpeak] = useState(true);
  const [providerMissing, setProviderMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const simulated = mode === "simulated" || providerMissing;

  const setState = (s: VoiceState) => { setStateRaw(s); onStateChange?.(s); };

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, state]);

  function say(text: string, done: () => void) {
    if (!speak || typeof window === "undefined" || !("speechSynthesis" in window)) {
      setTimeout(done, Math.min(2600, 600 + text.length * 25));
      return;
    }
    const u = new SpeechSynthesisUtterance(text.replace(/\(.*?\)/g, ""));
    u.lang = /[؀-ۿ]/.test(text) ? "ar-SA" : "en-US";
    u.rate = 1.02;
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || state === "thinking" || state === "speaking") return;
    setError(null);
    const history: Msg[] = [...msgs, { role: "user", content }];
    setMsgs(history);
    setInput("");
    setState("thinking");

    let reply = "";
    let transfer = false;
    if (simulated) {
      await new Promise((r) => setTimeout(r, 700));
      const r = scriptedReply(content);
      reply = r.text;
      transfer = !!r.transfer;
    } else {
      try {
        const res = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employee, employeeId, messages: history }) });
        const data = await res.json();
        if (res.status === 503 && data?.error?.code === "provider_not_configured") {
          setProviderMissing(true);
          setMsgs(history.slice(0, -1));
          setState("idle");
          return;
        }
        if (!res.ok) throw new Error(data?.error?.message ?? "Request failed");
        reply = data.reply;
        transfer = !!data.transfer;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
        setState("idle");
        return;
      }
    }
    setMsgs((m) => [...m, { role: "assistant", content: reply }]);
    setState("speaking");
    say(reply, () => setState(transfer ? "transfer" : "completed"));
  }

  function listen() {
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
    if (!SR) { setError(locale === "ar" ? "المتصفح لا يدعم إدخال الصوت. اكتب رسالتك." : "Voice input isn't supported in this browser — type instead."); return; }
    const rec = new SR();
    rec.lang = locale === "ar" ? "ar-KW" : "en-US";
    rec.interimResults = false;
    setState("listening");
    rec.onresult = (e) => send(e.results[0][0].transcript);
    rec.onerror = () => setState("idle");
    rec.onend = () => setStateRaw((s) => (s === "listening" ? "idle" : s));
    rec.start();
  }

  const stateColor: Record<VoiceState, string> = { idle: "bg-white/40", listening: "bg-electric", thinking: "bg-amber-300", speaking: "bg-violet-soft", completed: "bg-emerald-400", transfer: "bg-rose-400" };

  return (
    <div className={cn("glass glow-border flex flex-col overflow-hidden bg-ink-2/70", compact ? "h-[460px]" : "h-[540px]")}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <SoMascot state={state} size={44} hue={hue} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{(employee?.name as string) || t.demo.title}</p>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className={cn("h-2 w-2 rounded-full", stateColor[state], state !== "idle" && "animate-pulse")} />
            {t.demo.states[state]}
          </div>
        </div>
        {simulated && <Badge tone="amber">{t.demo.simulated}</Badge>}
        <button onClick={() => { setSpeak((s) => !s); window.speechSynthesis?.cancel(); }} className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-white" aria-label="Toggle voice">
          {speak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
      </div>

      {providerMissing && mode === "live" && (
        <div className="flex items-start gap-2 border-b border-amber-400/20 bg-amber-400/5 px-4 py-2.5 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{locale === "ar" ? "مزوّد الذكاء الاصطناعي غير مُعد (OPENAI_API_KEY). الردود التالية محاكاة فقط." : "AI provider not configured (OPENAI_API_KEY). Replies below are simulated only."}</span>
        </div>
      )}

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted">{t.demo.subtitle}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {t.demo.suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-line bg-white/[0.03] px-3 py-1.5 text-xs text-white/85 transition hover:border-violet/50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {msgs.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div dir="auto" className={cn("max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed", m.role === "user" ? "bg-violet text-white rounded-ee-md" : "bg-white/[0.06] text-white/95 rounded-es-md")}>
                {m.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {state === "thinking" && (
          <div className="flex gap-1 px-2">
            {[0, 1, 2].map((i) => <motion.span key={i} className="h-2 w-2 rounded-full bg-violet-soft" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />)}
          </div>
        )}
        {state === "transfer" && (
          <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-xs text-rose-200">
            <PhoneForwarded className="h-3.5 w-3.5" /> {t.demo.states.transfer}
          </div>
        )}
        {error && <p className="text-center text-xs text-rose-300">{error}</p>}
      </div>

      <div className="border-t border-line p-3">
        <div className="mb-2 flex justify-center"><Soundwave bars={32} active={state === "speaking" || state === "listening"} className="h-6" /></div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2">
          <button type="button" onClick={listen} className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line transition hover:border-electric/60", state === "listening" && "border-electric bg-electric/15 text-electric")} aria-label="Speak">
            <Mic className="h-4 w-4" />
          </button>
          <input dir="auto" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.demo.placeholder} className="input h-10" maxLength={500} />
          <button type="submit" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet shadow-glow transition hover:bg-violet-soft" aria-label={t.demo.send}>
            <Send className="h-4 w-4 rtl:-scale-x-100" />
          </button>
        </form>
      </div>
    </div>
  );
}

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: { 0: { transcript: string } }[] }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
}
