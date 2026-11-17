/** Chat building blocks: live captions, message thread, composer, mic button. */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, Square, SendHorizonal, Sparkles, CheckCircle2, Clock3 } from "lucide-react";
import { agentMeta, type AgentId } from "@shared/agents";
import { useSanad, type ThreadMsg } from "../lib/store";
import { useI18n } from "../i18n";
import { Markdown, cx, Icon } from "./ui";

/** Typewriter reveal for Sanad's caption. */
function useTypewriter(text: string, speed = 14) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (!text) return setShown("");
    let i = 0;
    setShown("");
    const id = setInterval(() => {
      i += Math.max(1, Math.round(text.length / 220));
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return shown;
}

export function Captions() {
  const { captions, orbState } = useSanad();
  const { t } = useI18n();
  const sanad = useTypewriter(captions.sanad);
  const firstLines = sanad.length > 420 ? `${sanad.slice(0, 420)}…` : sanad;
  return (
    <div className="mx-auto min-h-[96px] w-full max-w-2xl space-y-2 px-2 text-center" aria-live="polite">
      <AnimatePresence mode="popLayout">
        {captions.user && (
          <motion.p key={`u-${captions.user}`} dir="auto" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-zinc-400">
            “{captions.user}”
          </motion.p>
        )}
      </AnimatePresence>
      {orbState === "thinking" ? (
        <p className="text-sm text-neon-orange/80">{t.orb.thinking}</p>
      ) : firstLines ? (
        <p dir="auto" className="whitespace-pre-line text-base leading-relaxed text-zinc-100 sm:text-lg">{firstLines.replace(/[*#`]/g, "")}</p>
      ) : (
        <p className="text-sm text-zinc-500">{t.orb[orbState]}</p>
      )}
    </div>
  );
}

export function MicButton({ size = "lg" }: { size?: "lg" | "sm" }) {
  const { orbState, startVoice, stopVoice, stopTalking } = useSanad();
  const { t } = useI18n();
  const downAt = useRef(0);
  const active = orbState === "listening" || orbState === "speaking";

  const onDown = () => {
    downAt.current = Date.now();
    if (orbState === "idle") startVoice();
  };
  const onUp = () => {
    const held = Date.now() - downAt.current;
    if (orbState === "listening" && held > 450) stopVoice(); // hold-to-talk release
  };
  const onClick = () => {
    if (Date.now() - downAt.current > 450) return; // handled by hold
    if (orbState === "listening") stopVoice();
    else if (orbState === "speaking") stopTalking();
  };

  const dim = size === "lg" ? "h-16 w-16" : "h-11 w-11";
  return (
    <button
      onPointerDown={onDown}
      onPointerUp={onUp}
      onClick={onClick}
      aria-label={active ? t.voice.stop : t.voice.pushToTalk}
      title={t.voice.pushToTalk}
      className={cx("relative grid shrink-0 place-items-center rounded-full text-white transition-transform active:scale-95", dim)}
      style={{ background: active ? "linear-gradient(135deg,#fb923c,#f43f5e)" : "linear-gradient(135deg,#7c3aed,#a855f7 60%,#fb923c)", boxShadow: active ? "0 0 30px rgba(251,146,60,.6)" : "0 0 24px rgba(168,85,247,.5)" }}
    >
      {orbState === "listening" && <span className="absolute inset-0 animate-ping rounded-full bg-neon-orange/40" />}
      {active ? <Square className={size === "lg" ? "h-6 w-6" : "h-4 w-4"} fill="currentColor" /> : <Mic className={size === "lg" ? "h-7 w-7" : "h-5 w-5"} />}
    </button>
  );
}

export function Composer({ agentId, placeholder, onSent, compact = false }: { agentId?: AgentId; placeholder?: string; onSent?: (reply: string) => void; compact?: boolean }) {
  const { send, busy } = useSanad();
  const { t } = useI18n();
  const [text, setText] = useState("");
  const submit = async () => {
    const v = text.trim();
    if (!v || busy) return;
    setText("");
    const r = await send(v, { agentId, voice: false });
    if (r) onSent?.(r.reply);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className={cx("glass flex items-end gap-2 rounded-2xl p-1.5", compact && "rounded-xl")}
    >
      <textarea
        dir="auto"
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder ?? t.chat.placeholder}
        className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
      />
      <button type="submit" disabled={!text.trim() || busy} className="btn-primary h-10 w-10 shrink-0 rounded-xl p-0" aria-label={t.chat.send}>
        {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <SendHorizonal className="h-4 w-4 rtl:-scale-x-100" />}
      </button>
    </form>
  );
}

export function MessageBubble({ m }: { m: ThreadMsg }) {
  const { t, lang } = useI18n();
  const mine = m.role === "user";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cx("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cx("max-w-[88%] rounded-2xl px-3.5 py-2.5", mine ? "rounded-ee-md bg-gradient-to-br from-neon-violet/70 to-neon-purple/50 text-white" : "glass rounded-es-md")}>
        {!mine && m.delegations && m.delegations.length > 0 && (
          <div className="mb-1.5 flex flex-wrap items-center gap-1 text-[10px] text-zinc-400">
            <Sparkles className="h-3 w-3 text-neon-orange" /> {t.chat.delegated}
            {m.delegations.map((d) => {
              const a = agentMeta(d);
              return (
                <span key={d} className="chip" style={{ borderColor: `${a.color}55`, color: a.color }}>
                  <Icon name={a.icon} className="h-3 w-3" /> {a.name[lang]}
                </span>
              );
            })}
          </div>
        )}
        {mine ? <p dir="auto" className="whitespace-pre-wrap text-sm">{m.content}</p> : <Markdown text={m.content} />}
        {!mine && (m.actions?.length || m.pending?.length) ? (
          <div className="mt-2 space-y-1 border-t border-white/5 pt-2">
            {m.actions?.map((a, i) => (
              <p key={i} dir="auto" className="flex items-center gap-1.5 text-[11px] text-emerald-300/90"><CheckCircle2 className="h-3 w-3 shrink-0" /> {a.summary}</p>
            ))}
            {m.pending?.map((p) => (
              <p key={p.id} dir="auto" className="flex items-center gap-1.5 text-[11px] text-orange-300/90"><Clock3 className="h-3 w-3 shrink-0" /> {p.summary}</p>
            ))}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

export function Thread({ messages, className = "" }: { messages: ThreadMsg[]; className?: string }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);
  return (
    <div className={cx("space-y-3 overflow-y-auto scrollbar-thin", className)}>
      {messages.map((m) => (
        <MessageBubble key={m.id} m={m} />
      ))}
      <div ref={end} />
    </div>
  );
}
