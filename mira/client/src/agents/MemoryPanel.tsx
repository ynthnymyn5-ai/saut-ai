/** Memory: view, search (semantic), add, edit, pin and delete what Mira knows. */
import { useEffect, useState } from "react";
import { Pin, Trash2, Sparkles, Search, Check, X } from "lucide-react";
import { api } from "../lib/api";
import { useData, useMira } from "../lib/store";
import { useI18n } from "../i18n";
import { Card, cx, Empty } from "../components/ui";
import { useConfirm } from "../components/ConfirmModal";

type Kind = "fact" | "person" | "business" | "preference";
interface Memory { id: number; kind: Kind; content: string; source: string; pinned: boolean; updatedAt: string; similarity?: number }

const KIND_STYLE: Record<Kind, string> = {
  fact: "border-violet-400/30 text-violet-200",
  person: "border-sky-400/30 text-sky-200",
  business: "border-orange-400/40 text-orange-200",
  preference: "border-pink-400/30 text-pink-200",
};

export function MemoryPanel() {
  const { t, fmtDate } = useI18n();
  const { bump } = useMira();
  const ask = useConfirm();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [kind, setKind] = useState<"all" | Kind>("all");
  const [newText, setNewText] = useState("");
  const [newKind, setNewKind] = useState<Kind>("fact");
  const [edit, setEdit] = useState<{ id: number; content: string } | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(id);
  }, [q]);

  const [memories, reload] = useData(() => api.get<Memory[]>(`/api/memories${debounced ? `?q=${encodeURIComponent(debounced)}` : ""}`), [debounced]);
  const shown = (memories ?? []).filter((m) => kind === "all" || m.kind === kind);

  const add = async () => {
    if (newText.trim().length < 3) return;
    await api.post("/api/memories", { content: newText.trim(), kind: newKind });
    setNewText("");
    reload();
    bump();
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="label mb-2">{t.memory.add}</p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input dir="auto" className="input flex-1" placeholder={t.memory.placeholder} value={newText} onChange={(e) => setNewText(e.target.value)} />
          <select className="input sm:w-36" value={newKind} onChange={(e) => setNewKind(e.target.value as Kind)}>
            {(Object.keys(KIND_STYLE) as Kind[]).map((k) => <option key={k} value={k}>{t.memory.kinds[k]}</option>)}
          </select>
          <button className="btn-primary" type="submit">{t.common.save}</button>
        </form>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input dir="auto" className="input ps-9" placeholder={`${t.memory.semantic}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1 text-xs">
          {(["all", "fact", "person", "business", "preference"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={cx("whitespace-nowrap rounded-lg px-3 py-1", kind === k ? "bg-white/10 text-white" : "text-zinc-400")}>
              {k === "all" ? t.common.all : t.memory.kinds[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {shown.map((m) => (
          <Card key={m.id} className="group flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              {edit?.id === m.id ? (
                <div className="flex gap-2">
                  <input dir="auto" autoFocus className="input" value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} />
                  <button
                    className="btn-primary px-2"
                    aria-label={t.common.save}
                    onClick={async () => {
                      await api.patch(`/api/memories/${m.id}`, { content: edit.content });
                      setEdit(null);
                      reload();
                    }}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button className="btn-ghost px-2" onClick={() => setEdit(null)} aria-label={t.common.cancel}><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <p dir="auto" className="cursor-text text-sm" onClick={() => setEdit({ id: m.id, content: m.content })}>{m.content}</p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500">
                <span className={cx("chip", KIND_STYLE[m.kind])}>{t.memory.kinds[m.kind]}</span>
                {m.source === "auto" && <span className="chip border-neon-orange/30 text-orange-200"><Sparkles className="h-3 w-3" /> {t.memory.auto}</span>}
                {typeof m.similarity === "number" && <span>{Math.round(m.similarity * 100)}% match</span>}
                <span>{fmtDate(m.updatedAt, { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
            </div>
            <button
              onClick={async () => {
                await api.patch(`/api/memories/${m.id}`, { pinned: !m.pinned });
                reload();
              }}
              className={cx("rounded-lg p-1.5 transition", m.pinned ? "text-neon-orange" : "text-zinc-600 hover:text-zinc-300")}
              aria-label={t.memory.pinned}
              title={t.memory.pinned}
            >
              <Pin className="h-4 w-4" fill={m.pinned ? "currentColor" : "none"} />
            </button>
            <button
              onClick={async () => {
                if (await ask({ body: m.content })) {
                  await api.del(`/api/memories/${m.id}`);
                  reload();
                  bump();
                }
              }}
              className="rounded-lg p-1.5 text-zinc-600 transition hover:text-red-300"
              aria-label={t.common.delete}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </Card>
        ))}
        {!shown.length && <Empty>{t.common.empty}</Empty>}
      </div>
    </div>
  );
}
