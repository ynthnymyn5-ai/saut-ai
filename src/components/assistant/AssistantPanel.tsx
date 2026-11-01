"use client";
import { Loader2, Mic, Send, Square, Volume2, VolumeX, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { Emotion } from "@/lib/assistant/core";
import { cn } from "@/lib/utils";
import { SoFace, type SoFaceHandle } from "./SoFace";
import { audioContext, BuiltinVoice, PhotorealFace, recordUtterance, type Speaker } from "./voice";

type Msg = { role: "user" | "assistant"; content: string };
type Phase = "idle" | "listening" | "thinking" | "speaking";

const L = {
  ar: {
    title: "SO · مساعدك الذكي", photoreal: "وجه واقعي", builtin: "الوجه المدمج", connecting: "جاري تشغيل الوجه…",
    hello: "هلا! أنا SO، مساعدك في صوت. اسألني عن نشاطك أو قل «افتح المواعيد».",
    placeholder: "اكتب سؤالك أو أمرك…", listen: "تحدّث", stop: "إيقاف", send: "إرسال", mute: "كتم الصوت", unmute: "تشغيل الصوت", close: "إغلاق",
    phase: { idle: "جاهز", listening: "أستمع…", thinking: "أفكر…", speaking: "أتكلم…" },
    chips: ["كيف الوضع الحين؟", "مواعيد اليوم", "كم مكالمة هالشهر؟", "افتح المحادثات"],
    noAi: "المساعد يحتاج إعداد OPENAI_API_KEY على الخادم.", noMic: "لم يُسمح باستخدام الميكروفون.", heardNothing: "ما سمعت شي، جرّب مرة ثانية.", error: "صار خطأ، حاول مرة ثانية.",
    demo: "وضع تجريبي — لا توجد بيانات حقيقية متصلة.",
  },
  en: {
    title: "SO · Your assistant", photoreal: "Photoreal face", builtin: "Built-in face", connecting: "Starting face…",
    hello: "Hi! I'm SO, your SAUT AI assistant. Ask about your business or say “open appointments”.",
    placeholder: "Type a question or command…", listen: "Speak", stop: "Stop", send: "Send", mute: "Mute voice", unmute: "Unmute voice", close: "Close",
    phase: { idle: "Ready", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…" },
    chips: ["How are things right now?", "Today's appointments", "Calls this month?", "Open conversations"],
    noAi: "The assistant needs OPENAI_API_KEY on the server.", noMic: "Microphone permission was denied.", heardNothing: "I didn't catch that — try again.", error: "Something went wrong — please try again.",
    demo: "Demo mode — no real data connected.",
  },
};

export default function AssistantPanel({ onClose }: { onClose: () => void }) {
  const { locale } = useI18n();
  const t = L[locale];
  const router = useRouter();
  const path = usePathname();
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: t.hello }]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [emotion, setEmotion] = useState<Emotion>("happy");
  const [input, setInput] = useState("");
  const [muted, setMuted] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [face, setFace] = useState<"connecting" | "photoreal" | "builtin">("connecting");
  const faceRef = useRef<SoFaceHandle>(null);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const speaker = useRef<Speaker>(new BuiltinVoice());
  const recAbort = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const turn = useRef(0);

  // Photoreal face if configured; otherwise (or if it ends) the built-in face.
  useEffect(() => {
    let alive = true;
    let real: PhotorealFace | null = null;
    (async () => {
      try {
        if (!video.current || !audio.current) throw new Error("no media");
        const r = await PhotorealFace.start(video.current, audio.current, () => { if (alive) { speaker.current = new BuiltinVoice(); setFace("builtin"); } });
        if (!alive) { if (r instanceof PhotorealFace) r.close(); return; }
        if (r instanceof PhotorealFace) { real = r; speaker.current = r; setFace("photoreal"); } else setFace("builtin");
      } catch { if (alive) setFace("builtin"); }
    })();
    return () => { alive = false; real?.close(); speaker.current.close(); recAbort.current?.abort(); };
  }, []);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, phase]);

  const say = useCallback(async (text: string, emo: Emotion, myTurn: number) => {
    if (muted) return;
    const r = await fetch("/api/assistant/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, emotion: emo, locale }) });
    if (!r.ok || myTurn !== turn.current) return;
    const pcm = new Uint8Array(await r.arrayBuffer());
    if (myTurn !== turn.current) return;
    setPhase("speaking");
    await speaker.current.speak(pcm, (l) => faceRef.current?.setMouth(l)).catch(() => {});
  }, [muted, locale]);

  const ask = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q) return;
    const myTurn = ++turn.current;
    speaker.current.stop();
    setNote(null);
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setPhase("thinking"); setEmotion("thinking");
    try {
      const history = msgs.slice(-8);
      const r = await fetch("/api/assistant/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: q, locale, path, history }) });
      const d = await r.json().catch(() => ({}));
      if (myTurn !== turn.current) return;
      if (!r.ok) {
        setEmotion("concerned"); setPhase("idle");
        setNote(d?.error?.code === "provider_not_configured" ? t.noAi : d?.error?.message ?? t.error);
        return;
      }
      if (d.demo) setNote(t.demo);
      setMsgs((m) => [...m, { role: "assistant", content: d.reply }]);
      setEmotion(d.emotion ?? "neutral");
      for (const a of d.actions ?? []) if (a.type === "navigate" && typeof a.href === "string" && a.href.startsWith("/dashboard")) router.push(a.href);
      await say(d.reply, d.emotion ?? "neutral", myTurn);
    } catch { setEmotion("concerned"); setNote(t.error); }
    finally { if (myTurn === turn.current) setPhase("idle"); }
  }, [msgs, locale, path, router, say, t]);

  async function talk() {
    if (phase === "listening") { recAbort.current?.abort(); return; }
    audioContext(); // unlock audio on this tap (iOS)
    turn.current++; speaker.current.stop(); // barge-in
    setNote(null); setPhase("listening"); setEmotion("neutral");
    const ac = new AbortController(); recAbort.current = ac;
    try {
      const blob = await recordUtterance({ signal: ac.signal, onLevel: () => {} });
      if (!blob) { setPhase("idle"); setNote(t.heardNothing); return; }
      setPhase("thinking"); setEmotion("thinking");
      const fd = new FormData(); fd.append("audio", blob, "command"); fd.append("locale", locale);
      const r = await fetch("/api/assistant/listen", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setPhase("idle"); setEmotion("concerned"); setNote(d?.error?.code === "provider_not_configured" ? t.noAi : t.error); return; }
      if (!d.text) { setPhase("idle"); setNote(t.heardNothing); return; }
      await ask(d.text);
    } catch {
      setPhase("idle"); setEmotion("concerned"); setNote(t.noMic);
    }
  }

  return (
    <section role="dialog" aria-label={t.title} className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] end-3 z-50 flex max-h-[min(640px,calc(100dvh-110px))] w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl border border-line bg-ink-2/95 shadow-[0_30px_80px_-20px_rgba(139,92,246,.55)] backdrop-blur-xl lg:bottom-6 lg:end-6">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{t.title}</p>
          <p className="text-[11px] text-muted">{face === "connecting" ? t.connecting : face === "photoreal" ? t.photoreal : t.builtin} · {t.phase[phase]}</p>
        </div>
        <button type="button" onClick={() => { setMuted((m) => !m); speaker.current.stop(); }} className="rounded-lg p-2 text-white/70 hover:bg-white/5 hover:text-white" aria-label={muted ? t.unmute : t.mute} title={muted ? t.unmute : t.mute}>
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/5 hover:text-white" aria-label={t.close}><X className="h-4 w-4" /></button>
      </header>

      <div className="relative grid shrink-0 place-items-center bg-[radial-gradient(120%_90%_at_50%_0%,rgba(139,92,246,.18),transparent_70%)] py-4">
        <div className={cn("relative aspect-square w-[200px] overflow-hidden rounded-[28px] ring-1 ring-violet/30 transition-shadow duration-700", face !== "photoreal" && "hidden",
          emotion === "concerned" ? "shadow-[0_0_40px_-6px_rgba(252,211,77,.55)]" : emotion === "happy" || emotion === "celebrating" ? "shadow-[0_0_40px_-6px_rgba(56,189,248,.6)]" : "shadow-[0_0_40px_-6px_rgba(139,92,246,.6)]")}>
          <video ref={video} autoPlay playsInline muted className="h-full w-full object-cover" />
          <audio ref={audio} autoPlay />
          {phase === "listening" && <span className="absolute inset-0 animate-pulse rounded-[28px] ring-2 ring-electric/70" />}
        </div>
        {face !== "photoreal" && <SoFace ref={faceRef} emotion={emotion} listening={phase === "listening"} size={180} />}
      </div>

      <div ref={listRef} className="min-h-[96px] flex-1 space-y-2 overflow-y-auto px-4 pb-2" aria-live="polite">
        {msgs.map((m, i) => (
          <p key={i} dir="auto" className={cn("max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed", m.role === "user" ? "ms-auto bg-violet/25 text-white" : "bg-white/[0.05] text-white/90")}>{m.content}</p>
        ))}
        {phase === "thinking" && <p className="inline-flex items-center gap-2 rounded-2xl bg-white/[0.05] px-3 py-2 text-sm text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t.phase.thinking}</p>}
        {note && <p className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-200">{note}</p>}
      </div>

      {msgs.length <= 2 && (
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
          {t.chips.map((c) => <button key={c} type="button" onClick={() => ask(c)} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs text-white/80 hover:border-violet/50 hover:text-white">{c}</button>)}
        </div>
      )}

      <form className="flex items-center gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); void ask(input); }}>
        <button type="button" onClick={talk} aria-label={phase === "listening" ? t.stop : t.listen} title={phase === "listening" ? t.stop : t.listen}
          className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full transition", phase === "listening" ? "bg-rose-500 text-white" : "bg-brand-gradient text-white shadow-glow")}>
          {phase === "listening" ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
        </button>
        <input value={input} onChange={(e) => setInput(e.target.value)} dir="auto" maxLength={1000} placeholder={t.placeholder} className="input h-11 flex-1 py-0" aria-label={t.placeholder} />
        <button type="submit" disabled={!input.trim() || phase === "thinking"} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-white/80 hover:border-violet/50 disabled:opacity-40" aria-label={t.send}>
          <Send className="h-4 w-4 rtl:-scale-x-100" />
        </button>
      </form>
    </section>
  );
}
