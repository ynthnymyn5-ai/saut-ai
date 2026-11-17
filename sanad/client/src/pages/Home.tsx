/** Home: the orb, live captions, push-to-talk, wake word and text chat. */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquareText, Plus, Ear, X } from "lucide-react";
import { Orb } from "../components/Orb";
import { Captions, Composer, MicButton, Thread } from "../components/Conversation";
import { useSanad } from "../lib/store";
import { useI18n } from "../i18n";
import { cx } from "../components/ui";

export function HomePage() {
  const { orbState, thread, prefs, setPref, newConversation, send, startVoice, stopTalking, busy } = useSanad();
  const { t } = useI18n();
  const [showThread, setShowThread] = useState(false);

  const onOrb = () => {
    if (orbState === "idle") startVoice();
    else stopTalking();
  };

  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-120px)] max-w-6xl gap-6 px-4 pt-4 md:min-h-screen md:px-8 md:pt-8">
      <section className="flex min-w-0 flex-1 flex-col items-center">
        {/* top controls */}
        <div className="flex w-full items-center justify-between gap-2">
          <button onClick={() => setPref("wakeWord", !prefs.wakeWord)} className={cx("btn-ghost px-3 py-1.5 text-xs", prefs.wakeWord && "border-neon-purple/50 bg-neon-purple/15 text-white")}>
            <Ear className="h-3.5 w-3.5" /> {t.voice.wakeWord}
            <span className={cx("h-1.5 w-1.5 rounded-full", prefs.wakeWord ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-zinc-600")} />
          </button>
          <div className="flex gap-2">
            <button onClick={newConversation} className="btn-ghost px-3 py-1.5 text-xs" title={t.chat.newChat}>
              <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t.chat.newChat}</span>
            </button>
            <button onClick={() => setShowThread((s) => !s)} className={cx("btn-ghost px-3 py-1.5 text-xs lg:hidden", showThread && "bg-white/10")}>
              <MessageSquareText className="h-3.5 w-3.5" /> {thread.length || ""}
            </button>
          </div>
        </div>

        {/* orb */}
        <div className="relative mt-2 flex w-full flex-1 flex-col items-center justify-center">
          <Orb state={orbState} size={420} onClick={onOrb} className="!h-[min(72vw,42vh,420px)] !w-[min(72vw,42vh,420px)]" />
          <Captions />
        </div>

        {/* controls */}
        <div className="z-10 mt-4 w-full max-w-2xl space-y-3 pb-4 md:sticky md:bottom-4">
          {thread.length === 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin sm:flex-wrap sm:justify-center">
              {t.chat.suggestions.map((s) => (
                <button key={s} disabled={busy} onClick={() => send(s, { voice: false })} dir="auto" className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-neon-purple/50 hover:bg-neon-purple/10 hover:text-white">
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Composer />
            </div>
            <MicButton />
          </div>
        </div>
      </section>

      {/* conversation — side panel on desktop, sheet on mobile */}
      <aside className="hidden w-[380px] shrink-0 lg:block">
        <div className="glass sticky top-8 flex h-[calc(100vh-4rem)] flex-col rounded-3xl p-4">
          <p className="label mb-3">{t.chat.showThread}</p>
          {thread.length ? <Thread messages={thread} className="flex-1 pe-1" /> : <p className="text-sm text-zinc-500">{t.common.empty}</p>}
        </div>
      </aside>
      <AnimatePresence>
        {showThread && (
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 260 }} className="glass-strong fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col rounded-t-3xl p-4 lg:hidden">
            <div className="mb-3 flex items-center justify-between">
              <p className="label">{t.chat.showThread}</p>
              <button onClick={() => setShowThread(false)} className="rounded-lg p-1 hover:bg-white/10" aria-label={t.common.close}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <Thread messages={thread} className="flex-1 pb-24" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
