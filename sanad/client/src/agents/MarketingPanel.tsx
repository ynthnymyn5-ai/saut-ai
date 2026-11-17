/** Marketing: content calendar (month grid) + ideas/drafts board. */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, Camera, Copy } from "lucide-react";
import { api } from "../lib/api";
import { useData, useSanad } from "../lib/store";
import { useI18n } from "../i18n";
import { Card, Field, Modal, SectionTitle, cx, fromLocalInput, toLocalInput } from "../components/ui";
import { useConfirm } from "../components/ConfirmModal";

interface Item { id: number; title: string; platform: string; caption: string | null; status: "idea" | "draft" | "scheduled" | "published"; scheduledFor: string | null }

const PLATFORMS = ["instagram", "tiktok", "linkedin", "x", "facebook", "youtube", "blog", "email"];
const STATUS_STYLE: Record<string, string> = {
  idea: "border-sky-400/30 text-sky-200",
  draft: "border-violet-400/30 text-violet-200",
  scheduled: "border-orange-400/40 text-orange-200",
  published: "border-emerald-400/40 text-emerald-200",
};

export function MarketingPanel() {
  const { t, lang, fmtDate } = useI18n();
  const { bump, toast } = useSanad();
  const ask = useConfirm();
  const [items, reload] = useData(() => api.get<Item[]>("/api/content"));
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const days = useMemo(() => {
    const first = new Date(cursor);
    const startPad = (first.getDay() + 6) % 7; // Monday-first
    const n = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return [...Array(startPad).fill(null), ...Array.from({ length: n }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))];
  }, [cursor]);
  const onDay = (d: Date) => (items ?? []).filter((x) => x.scheduledFor && new Date(x.scheduledFor).toDateString() === d.toDateString());
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang === "ar" ? "ar-KW" : "en-GB", { weekday: "narrow" }).format(new Date(2024, 0, 1 + i)));

  const save = async () => {
    if (!editing?.title) return;
    const body = { title: editing.title, platform: editing.platform ?? "instagram", caption: editing.caption ?? null, status: editing.status ?? "idea", scheduledFor: editing.scheduledFor ?? null };
    if (editing.id) await api.patch(`/api/content/${editing.id}`, body);
    else await api.post("/api/content", body);
    setEditing(null);
    reload();
    bump();
  };

  const board = (["idea", "draft", "scheduled", "published"] as const).map((s) => ({ s, list: (items ?? []).filter((x) => x.status === s) }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-4 lg:col-span-3">
          <SectionTitle
            action={
              <div className="flex items-center gap-1">
                <button className="rounded-lg p-1 hover:bg-white/10" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></button>
                <span className="min-w-[110px] text-center text-xs text-zinc-300">{new Intl.DateTimeFormat(lang === "ar" ? "ar-KW" : "en-GB", { month: "long", year: "numeric" }).format(cursor)}</span>
                <button className="rounded-lg p-1 hover:bg-white/10" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4 rtl:rotate-180" /></button>
              </div>
            }
          >
            {t.marketing.calendar}
          </SectionTitle>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-zinc-500">
            {weekdays.map((w, i) => <div key={i}>{w}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              if (!d) return <div key={i} />;
              const list = onDay(d);
              const today = d.toDateString() === new Date().toDateString();
              return (
                <button
                  key={i}
                  onClick={() => setEditing({ status: "scheduled", platform: "instagram", scheduledFor: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 19).toISOString() })}
                  className={cx("min-h-[54px] rounded-lg border p-1 text-start align-top transition hover:border-white/20 sm:min-h-[72px]", today ? "border-neon-purple/60 bg-neon-purple/10" : "border-white/5 bg-black/20")}
                >
                  <span className={cx("text-[10px]", today ? "text-white" : "text-zinc-500")}>{d.getDate()}</span>
                  {list.map((x) => (
                    <span
                      key={x.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(x);
                      }}
                      className={cx("mt-0.5 block truncate rounded px-1 text-[9px] sm:text-[10px]", x.status === "published" ? "bg-emerald-500/20 text-emerald-100" : "bg-orange-500/20 text-orange-100")}
                    >
                      {x.title}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        </Card>

        <div className="space-y-3 lg:col-span-2">
          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => setEditing({ status: "idea", platform: "instagram" })}>
              <Plus className="h-4 w-4" /> {t.marketing.newItem}
            </button>
          </div>
          {board.map(({ s, list }) => (
            <Card key={s} className="p-3">
              <p className="mb-2 flex items-center justify-between text-xs font-semibold">
                <span className={cx("chip", STATUS_STYLE[s])}>{t.marketing.statuses[s]}</span>
                <span className="text-zinc-500">{list.length}</span>
              </p>
              <div className="space-y-1.5">
                {list.map((x) => (
                  <button key={x.id} onClick={() => setEditing(x)} className="flex w-full items-center gap-2 rounded-lg bg-black/20 px-2.5 py-2 text-start text-sm hover:bg-white/5">
                    {x.platform === "instagram" ? <Camera className="h-3.5 w-3.5 shrink-0 text-pink-300" /> : <span className="text-[10px] uppercase text-zinc-500">{x.platform.slice(0, 2)}</span>}
                    <span dir="auto" className="flex-1 truncate">{x.title}</span>
                    {x.scheduledFor && <span className="text-[10px] text-zinc-500">{fmtDate(x.scheduledFor, { day: "numeric", month: "short" })}</span>}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? editing.title : t.marketing.newItem} wide>
        {editing && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field label={t.ops.title}>
              <input dir="auto" autoFocus required className="input" value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t.marketing.platform}>
                <select className="input" value={editing.platform} onChange={(e) => setEditing({ ...editing, platform: e.target.value })}>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label={t.finance.status}>
                <select className="input" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as Item["status"] })}>
                  {(["idea", "draft", "scheduled", "published"] as const).map((s) => <option key={s} value={s}>{t.marketing.statuses[s]}</option>)}
                </select>
              </Field>
              <Field label={t.marketing.scheduledFor}>
                <input type="datetime-local" className="input" value={toLocalInput(editing.scheduledFor)} onChange={(e) => setEditing({ ...editing, scheduledFor: fromLocalInput(e.target.value) })} />
              </Field>
            </div>
            <Field label={t.marketing.caption}>
              <textarea dir="auto" className="input min-h-[140px]" value={editing.caption ?? ""} onChange={(e) => setEditing({ ...editing, caption: e.target.value })} />
            </Field>
            <div className="flex gap-2 pt-1">
              {editing.id && (
                <button
                  type="button"
                  className="btn-danger"
                  aria-label={t.common.delete}
                  onClick={async () => {
                    if (await ask({ body: editing.title })) {
                      await api.del(`/api/content/${editing.id}`);
                      setEditing(null);
                      reload();
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              {editing.caption && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    void navigator.clipboard.writeText(editing.caption ?? "");
                    toast(t.common.copied, "success");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </button>
              )}
              <button type="button" className="btn-ghost flex-1" onClick={() => setEditing(null)}>{t.common.cancel}</button>
              <button type="submit" className="btn-primary flex-1">{t.common.save}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
