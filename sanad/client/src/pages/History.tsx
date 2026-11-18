/** Searchable conversation history (web, Telegram, WhatsApp). */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MessageCircle, Send, Smartphone, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useData, useSanad, type ThreadMsg } from "../lib/store";
import { useI18n } from "../i18n";
import { Card, Empty, Modal } from "../components/ui";
import { Thread } from "../components/Conversation";
import { useConfirm } from "../components/ConfirmModal";

interface Conv { id: number; title: string; channel: string; updatedAt: string }
interface Hit { conversationId: number; title: string; channel: string; messageId: number; role: string; content: string; createdAt: string }

const ChannelIcon = ({ c }: { c: string }) => (c === "telegram" ? <Send className="h-4 w-4 text-sky-300" /> : c === "whatsapp" ? <Smartphone className="h-4 w-4 text-emerald-300" /> : <MessageCircle className="h-4 w-4 text-violet-300" />);

function highlight(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, 160);
  const start = Math.max(0, i - 60);
  return (
    <>
      {start > 0 && "…"}
      {text.slice(start, i)}
      <mark className="rounded bg-neon-orange/30 px-0.5 text-white">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length, i + q.length + 100)}…
    </>
  );
}

export function HistoryPage() {
  const { t, fmtDate } = useI18n();
  const { loadConversation } = useSanad();
  const nav = useNavigate();
  const ask = useConfirm();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [view, setView] = useState<{ id: number; title: string; messages: ThreadMsg[] } | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  const [data, reload] = useData(() => api.get<{ conversations?: Conv[]; hits?: Hit[] }>(`/api/conversations${debounced ? `?q=${encodeURIComponent(debounced)}` : ""}`), [debounced]);

  const open = async (id: number) => {
    const r = await api.get<{ conversation: Conv; messages: { id: number; role: "user" | "assistant"; content: string }[] }>(`/api/conversations/${id}`);
    setView({ id, title: r.conversation.title, messages: r.messages.map((m) => ({ id: String(m.id), role: m.role, content: m.content })) });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 md:px-8 md:pt-10">
      <h1 className="mb-4 text-xl font-semibold">{t.history.title}</h1>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input dir="auto" className="input ps-9" placeholder={t.history.search} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="space-y-2">
        {data?.conversations?.map((c) => (
          <Card key={c.id} className="flex cursor-pointer items-center gap-3 p-3 hover:border-white/20" onClick={() => open(c.id)}>
            <ChannelIcon c={c.channel} />
            <div className="min-w-0 flex-1">
              <p dir="auto" className="truncate text-sm font-medium">{c.title}</p>
              <p className="text-[11px] capitalize text-zinc-500">{c.channel} · {fmtDate(c.updatedAt)}</p>
            </div>
            <button
              className="rounded-lg p-1.5 text-zinc-600 hover:text-red-300"
              aria-label={t.common.delete}
              onClick={async (e) => {
                e.stopPropagation();
                if (await ask({ body: c.title })) {
                  await api.del(`/api/conversations/${c.id}`);
                  reload();
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </Card>
        ))}
        {data?.hits?.map((h) => (
          <Card key={h.messageId} className="cursor-pointer p-3 hover:border-white/20" onClick={() => open(h.conversationId)}>
            <div className="mb-1 flex items-center gap-2 text-[11px] text-zinc-500">
              <ChannelIcon c={h.channel} /> <span dir="auto" className="truncate">{h.title}</span> · {h.role === "user" ? t.chat.you : "Sanad"} · {fmtDate(h.createdAt)}
            </div>
            <p dir="auto" className="text-sm text-zinc-300">{highlight(h.content, debounced)}</p>
          </Card>
        ))}
        {data && !data.conversations?.length && !data.hits?.length && <Empty>{debounced ? t.history.noResults : t.common.empty}</Empty>}
      </div>

      <Modal open={Boolean(view)} onClose={() => setView(null)} title={view?.title} wide>
        {view && (
          <>
            <Thread messages={view.messages} className="max-h-[55vh] pe-1" />
            <button
              className="btn-primary mt-4 w-full"
              onClick={async () => {
                await loadConversation(view.id);
                setView(null);
                nav("/");
              }}
            >
              {t.history.continue}
            </button>
          </>
        )}
      </Modal>
    </div>
  );
}
