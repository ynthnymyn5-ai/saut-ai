"use client";
import { MessageSquareText, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { useApi, useMutate, useTr } from "@/components/os/shared";

type Reply = { id: string; title: string; body: string };

/** Picker for saved replies next to the inbox composer: tap to insert, add or delete in place. */
export function SavedReplies({ onPick }: { onPick: (text: string) => void }) {
  const tr = useTr();
  const mutate = useMutate();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null);
  const list = useApi<{ replies: Reply[] }>(open ? "/api/saved-replies" : null);

  return (
    <div className="relative">
      <Button type="button" variant="ghost" aria-label={tr("Saved replies", "ردود جاهزة")} aria-expanded={open} onClick={() => setOpen((v) => !v)}><MessageSquareText className="h-4 w-4" /></Button>
      {open && (
        <div className="absolute bottom-12 z-20 w-72 max-w-[85vw] rounded-2xl border border-line bg-ink-2 p-3 shadow-2xl ltr:left-0 rtl:right-0">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">{tr("Saved replies", "ردود جاهزة")}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label={tr("Close", "إغلاق")} className="text-muted hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {(list.data?.replies ?? []).map((r) => (
              <li key={r.id} className="group flex items-start gap-1">
                <button type="button" className="flex-1 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-white/5" onClick={() => { onPick(r.body); setOpen(false); }}>
                  <span className="block font-medium" dir="auto">{r.title}</span>
                  <span className="line-clamp-2 block text-xs text-muted" dir="auto">{r.body}</span>
                </button>
                <button type="button" aria-label={tr("Delete", "حذف")} className="p-1.5 text-muted opacity-60 hover:text-rose-300 group-hover:opacity-100"
                  onClick={async () => { if (await mutate(`/api/saved-replies/${r.id}`, "DELETE", undefined, tr("Deleted", "تم الحذف"))) list.reload(); }}><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
            {list.data && list.data.replies.length === 0 && !draft && <li className="px-2 py-2 text-xs text-muted">{tr("No saved replies yet — add your address, hours or offers.", "ما فيه ردود جاهزة — أضف عنوانك أو الدوام أو العروض.")}</li>}
          </ul>
          {draft ? (
            <form className="mt-2 space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await mutate("/api/saved-replies", "POST", draft, tr("Saved", "تم الحفظ"))) { setDraft(null); list.reload(); } }}>
              <input required maxLength={60} dir="auto" className="input py-1.5 text-sm" placeholder={tr("Title (e.g. Location)", "العنوان (مثلاً: الموقع)")} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <textarea required maxLength={2000} rows={3} dir="auto" className="input py-1.5 text-sm" placeholder={tr("The message", "نص الرسالة")} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
              <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>{tr("Cancel", "إلغاء")}</Button><Button type="submit" size="sm">{tr("Save", "حفظ")}</Button></div>
            </form>
          ) : (
            <Button type="button" size="sm" variant="outline" className="mt-2 w-full" onClick={() => setDraft({ title: "", body: "" })}><Plus className="h-4 w-4" />{tr("New saved reply", "رد جاهز جديد")}</Button>
          )}
        </div>
      )}
    </div>
  );
}
