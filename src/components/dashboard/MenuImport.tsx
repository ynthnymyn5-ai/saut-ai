"use client";
import { Camera, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { useMutate, useTr } from "@/components/os/shared";
import { useToast } from "@/components/ui/Toast";

type Row = { name: string; description: string | null; price: string; currency: string; pick: boolean };

/** Photo/PDF of a menu → AI reads it → owner reviews/edits → adds. Items without a price can't be added until one is typed. */
export function MenuImport({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const tr = useTr();
  const toast = useToast();
  const mutate = useMutate();
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);

  async function read(file: File | undefined) {
    if (!file || reading) return;
    if (file.size > 10 * 1024 * 1024) return toast({ kind: "error", title: tr("The file must be under 10 MB", "حجم الملف يجب أن يكون أقل من ١٠ ميغابايت") });
    setReading(true);
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/products/import", { method: "POST", body: fd }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setReading(false);
    if (!res?.ok) return toast({ kind: "error", title: j?.error?.message ?? tr("Couldn't read the menu", "تعذّرت قراءة المنيو") });
    if (j.demo) return toast({ kind: "info", title: tr("Demo mode: nothing was read", "وضع تجريبي: لم يُقرأ شيء") });
    const items = (j.items ?? []) as { name: string; description: string | null; price: number | null; currency: string }[];
    if (!items.length) return toast({ kind: "error", title: tr("No items were found. Try a clearer, straight photo.", "لم يُعثر على أصناف. جرّب صورة أوضح ومستقيمة.") });
    setRows(items.map((i) => ({ name: i.name, description: i.description, price: i.price === null ? "" : String(i.price), currency: i.currency, pick: i.price !== null })));
  }

  const ready = (rows ?? []).filter((r) => r.pick && r.name.trim() && r.price !== "" && !Number.isNaN(Number(r.price)));
  const missing = (rows ?? []).filter((r) => r.pick && (r.price === "" || Number.isNaN(Number(r.price)))).length;

  async function add() {
    if (!ready.length || saving) return;
    setSaving(true);
    const r = await mutate("/api/products/bulk", "POST", { items: ready.map((x) => ({ name: x.name.trim(), description: x.description, price: Math.round(Number(x.price) * 1000) / 1000, currency: x.currency })) });
    setSaving(false);
    if (r) { toast({ kind: "success", title: tr(`${r.added} products added${r.skipped ? ` · ${r.skipped} already existed` : ""}`, `أُضيف ${r.added} منتج${r.skipped ? ` · ${r.skipped} موجود مسبقاً` : ""}`) }); onAdded(); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass my-8 w-full max-w-2xl bg-ink-2 p-6">
        <div className="flex items-center justify-between"><h3 className="font-display text-lg font-semibold">{tr("Import from menu photo", "استيراد من صورة المنيو")}</h3><button aria-label={tr("Close", "إغلاق")} onClick={onClose}><X className="h-5 w-5" /></button></div>
        {!rows ? (
          <div className="mt-5">
            <button type="button" disabled={reading} onClick={() => input.current?.click()} className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-line p-10 text-center hover:border-violet/50">
              {reading ? <Loader2 className="h-10 w-10 animate-spin text-violet-soft" /> : <Camera className="h-10 w-10 text-violet-soft" />}
              <p className="mt-3 font-semibold">{reading ? tr("SO is reading your menu…", "سو يقرأ المنيو…") : tr("Take or choose a photo of your menu", "صوّر المنيو أو اختر صورة")}</p>
              <p className="mt-1 text-xs text-muted">JPG · PNG · WEBP · PDF · {tr("up to 10 MB", "حتى ١٠ ميغابايت")}</p>
            </button>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" hidden onChange={(e) => read(e.target.files?.[0])} />
            <p className="mt-3 text-xs text-muted">{tr("Prices are taken only as printed. Anything unclear is left empty for you to fill — SO never guesses a price.", "تؤخذ الأسعار كما هي مكتوبة فقط. وأي سعر غير واضح يُترك فارغاً لتكتبه أنت — سو لا يخمّن الأسعار.")}</p>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-muted">{tr(`${rows.length} items found. Review, fix and choose what to add.`, `تم العثور على ${rows.length} صنف. راجع وعدّل واختر ما تريد إضافته.`)}</p>
            {missing > 0 && <p className="mt-1 text-xs text-amber-200">{tr(`${missing} selected items have no price yet — type it or untick them.`, `${missing} من الأصناف المختارة بدون سعر — اكتبه أو ألغِ اختيارها.`)}</p>}
            <div className="mt-3 max-h-[50vh] space-y-1.5 overflow-y-auto pe-1">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl border border-line p-2">
                  <input type="checkbox" aria-label={tr("Add", "إضافة")} className="h-4 w-4 accent-violet" checked={r.pick} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pick: e.target.checked } : x)))} />
                  <input aria-label={tr("Name", "الاسم")} dir="auto" maxLength={160} className="input min-w-0 flex-1 py-1.5 text-sm" value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <input aria-label={tr("Price", "السعر")} inputMode="decimal" dir="ltr" placeholder={tr("price", "السعر")} className={`input w-24 py-1.5 text-sm ${r.pick && r.price === "" ? "border-amber-400/60" : ""}`} value={r.price} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(/[^0-9.]/g, "") } : x)))} />
                  <span className="w-10 text-xs text-muted" dir="ltr">{r.currency}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap justify-between gap-2">
              <Button variant="ghost" onClick={() => setRows(null)}>{tr("Another photo", "صورة أخرى")}</Button>
              <Button disabled={!ready.length || saving} onClick={add}>{saving ? tr("Adding…", "جارٍ الإضافة…") : tr(`Add ${ready.length} products`, `إضافة ${ready.length} منتج`)}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
