"use client";
import { BellPlus, CalendarCheck, FileText, MessagesSquare, Phone, Tag, Target, ListTodo } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Skeleton } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import { formatDate } from "@/lib/utils";
import { useApi, useMutate, useTr } from "./shared";

type Item = { at: string; kind: "call" | "conversation" | "appointment" | "note" | "lead" | "task"; title: string; detail?: string | null; status?: string | null };
const ICON = { call: Phone, conversation: MessagesSquare, appointment: CalendarCheck, note: FileText, lead: Target, task: ListTodo };

/** Customer timeline + tags + follow-up reminder (CRM drawer). */
export function CustomerTimeline({ id }: { id: string }) {
  const tr = useTr();
  const { locale } = useI18n();
  const mutate = useMutate();
  const { data, loading, reload } = useApi<{ items: Item[]; tags: { name: string; color: string }[] }>(`/api/customers/${id}/timeline`);
  const [tag, setTag] = useState("");
  const [rem, setRem] = useState({ title: "", due: "" });

  return (
    <div className="mt-6 space-y-5">
      <div>
        <p className="label">{tr("Tags", "الوسوم")}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {(data?.tags ?? []).map((t) => <Badge key={t.name} tone="violet"><Tag className="h-3 w-3" />{t.name}</Badge>)}
          <form onSubmit={async (e) => { e.preventDefault(); if (tag.trim() && (await mutate(`/api/customers/${id}/notes`, "POST", { tags: [tag.trim()] }))) { setTag(""); reload(); } }} className="flex gap-1">
            <input aria-label={tr("New tag", "وسم جديد")} dir="auto" className="input w-28 py-1 text-xs" value={tag} onChange={(e) => setTag(e.target.value)} placeholder={tr("+ tag", "+ وسم")} maxLength={30} />
          </form>
        </div>
      </div>
      <form onSubmit={async (e) => { e.preventDefault(); if (await mutate(`/api/customers/${id}/notes`, "POST", { reminder: { title: rem.title, due_at: new Date(rem.due).toISOString() } }, tr("Reminder set", "تم ضبط التذكير"))) { setRem({ title: "", due: "" }); reload(); } }} className="space-y-2">
        <p className="label">{tr("Follow-up reminder", "تذكير متابعة")}</p>
        <input aria-label={tr("Reminder", "التذكير")} required dir="auto" className="input" value={rem.title} onChange={(e) => setRem({ ...rem, title: e.target.value })} placeholder={tr("e.g. Call about the catering quote", "مثل: الاتصال بخصوص عرض الضيافة")} />
        <div className="flex gap-2"><input aria-label={tr("Due", "الموعد")} required type="datetime-local" className="input" value={rem.due} onChange={(e) => setRem({ ...rem, due: e.target.value })} /><Button type="submit" variant="outline"><BellPlus className="h-4 w-4" /></Button></div>
      </form>
      <div>
        <p className="label">{tr("Timeline", "الخط الزمني")}</p>
        {loading ? <Skeleton className="h-32" /> : !data?.items.length ? <p className="text-sm text-muted">{tr("No interactions recorded yet.", "لا توجد تفاعلات مسجّلة بعد.")}</p> : (
          <ol className="relative space-y-3 border-s border-line ps-4">
            {data.items.map((it, i) => {
              const I = ICON[it.kind];
              return (
                <li key={i} className="relative">
                  <span className="absolute -start-[25px] top-0.5 grid h-5 w-5 place-items-center rounded-full border border-line bg-ink-2"><I className="h-3 w-3 text-electric" /></span>
                  <p className="text-sm"><span className="font-medium">{it.title}</span>{it.status && <span className="text-muted"> · {it.status}</span>}</p>
                  {it.detail && <p dir="auto" className="text-xs text-muted">{it.detail}</p>}
                  <p className="text-[11px] text-muted">{formatDate(it.at, locale)}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
