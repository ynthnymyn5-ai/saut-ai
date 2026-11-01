"use client";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarCheck, Download, MessagesSquare, Phone, Search, Tag, Trash2, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDate } from "@/lib/utils";
import { CustomerTimeline } from "@/components/os/CustomerTimeline";
import { CustomerEditor, NewCustomerButton } from "@/components/os/CustomerEditor";

type Customer = { id: string; name: string; phone: string; tags: string[]; notes: string; lastContact: string; conversations: number; appointments: number };

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  // neutralise spreadsheet formula injection
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function CustomersView({ customers: initial, demo, canErase = false }: { customers: Customer[]; demo: boolean; canErase?: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [sel, setSel] = useState<Customer | null>(null);
  const [notes, setNotes] = useState("");
  const [customers, setCustomers] = useState(initial);
  useEffect(() => setCustomers(initial), [initial]);
  const [erase, setErase] = useState<{ id: string; name: string; typed: string; busy: boolean } | null>(null);
  const router = useRouter();
  async function doErase() {
    if (!erase || erase.typed !== "ERASE" || erase.busy) return;
    setErase({ ...erase, busy: true });
    const res = await fetch(`/api/customers/${erase.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "ERASE" }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErase({ ...erase, busy: false }); return toast({ kind: "error", title: data?.error?.message ?? "Failed" }); }
    setCustomers((cs) => cs.filter((c) => c.id !== erase.id));
    setErase(null); setSel(null);
    toast({ kind: "success", title: locale === "ar" ? "تم حذف بيانات العميل" : "Customer data erased" });
    router.refresh();
  }
  const tags = useMemo(() => [...new Set(customers.flatMap((c) => c.tags))], [customers]);
  const rows = customers.filter((c) => (!tag || c.tags.includes(tag)) && `${c.name} ${c.phone}`.toLowerCase().includes(q.toLowerCase()));

  function exportCsv() {
    const head = ["Name", "Phone", "Tags", "Conversations", "Appointments", "Last contact", "Notes"];
    const body = rows.map((c) => [c.name, c.phone, c.tags.join("; "), c.conversations, c.appointments, c.lastContact, c.notes].map(csvCell).join(","));
    const blob = new Blob(["﻿" + [head.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `saut-customers${demo ? "-DEMO" : ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function saveNotes() {
    if (!sel || !notes.trim()) return;
    const res = await fetch(`/api/customers/${sel.id}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: notes.trim() }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast({ kind: "error", title: data?.error?.message ?? "Failed" });
    toast({ kind: data.demo ? "info" : "success", title: data.demo ? (locale === "ar" ? "وضع تجريبي — لم يُحفظ" : "Demo mode — not saved") : (locale === "ar" ? "تمت إضافة الملاحظة" : "Note added") });
    if (!data.demo) setNotes("");
  }

  return (
    <>
      <PageHeader title={t.dash.nav.customers} subtitle={`${customers.length}`} demo={demo} actions={<><NewCustomerButton demo={demo} /><Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" />{t.common.export}</Button></>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={locale === "ar" ? "ابحث بالاسم أو الرقم" : "Search name or phone"} className="input ps-9" /></div>
        <div className="flex gap-1.5 overflow-x-auto">
          <button onClick={() => setTag(null)} className={cn("shrink-0 rounded-xl border px-3 py-2 text-xs", !tag ? "border-violet bg-violet/15" : "border-line text-muted")}>{t.common.all}</button>
          {tags.map((x) => <button key={x} onClick={() => setTag(x)} className={cn("flex shrink-0 items-center gap-1 rounded-xl border px-3 py-2 text-xs", tag === x ? "border-violet bg-violet/15" : "border-line text-muted")}><Tag className="h-3 w-3" />{x}</button>)}
        </div>
      </div>

      {rows.length === 0 ? <EmptyState icon={<Users className="h-6 w-6" />} title={t.dash.empty} body={locale === "ar" ? "يضيف موظفك الذكي العملاء تلقائياً من المكالمات والمحادثات." : "Your AI employees add customers automatically from calls and chats."} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <button key={c.id} onClick={() => { setSel(c); setNotes(demo ? c.notes : ""); }} className="glass p-4 text-start transition hover:border-violet/40">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-brand-gradient text-sm font-semibold">{c.name.slice(0, 1)}</div>
                <div className="min-w-0"><p className="truncate font-medium">{c.name}</p><p className="text-xs text-muted" dir="ltr">{c.phone}</p></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">{c.tags.map((x) => <Badge key={x} tone="violet">{x}</Badge>)}</div>
              <p className="mt-3 text-[11px] text-muted">{formatDate(c.lastContact, locale)}</p>
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {sel && (
          <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSel(null)}>
            <motion.aside onClick={(e) => e.stopPropagation()} initial={{ x: locale === "ar" ? "-100%" : "100%" }} animate={{ x: 0 }} exit={{ x: locale === "ar" ? "-100%" : "100%" }} transition={{ type: "spring", damping: 30, stiffness: 280 }} className="h-full w-full max-w-md overflow-y-auto border-s border-line bg-ink-2 p-6">
              <div className="flex justify-between"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-full bg-brand-gradient font-semibold">{sel.name.slice(0, 1)}</div><div><h2 className="font-display text-lg font-semibold">{sel.name}</h2><p className="text-sm text-muted" dir="ltr">{sel.phone}</p></div></div><button onClick={() => setSel(null)} aria-label="Close"><X className="h-5 w-5" /></button></div>
              <div className="mt-6 grid grid-cols-3 gap-2">
                {[[MessagesSquare, sel.conversations, locale === "ar" ? "محادثات" : "Conversations"], [CalendarCheck, sel.appointments, locale === "ar" ? "مواعيد" : "Appointments"], [Phone, sel.tags.length, locale === "ar" ? "وسوم" : "Tags"]].map(([I, v, l], i) => {
                  const Icon = I as typeof Phone;
                  return <Card key={i} className="p-3 text-center"><Icon className="mx-auto h-4 w-4 text-electric" /><p className="mt-1 font-display text-xl font-semibold">{v as number}</p><p className="text-[10px] text-muted">{l as string}</p></Card>;
                })}
              </div>
              {!demo && <CustomerEditor id={sel.id} name={sel.name} phone={sel.phone} />}
              <div className="mt-6"><label className="label" htmlFor="notes">{locale === "ar" ? "ملاحظة جديدة" : "New note"}</label><textarea id="notes" dir="auto" rows={5} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} className="input" /></div>
              <Button className="mt-3 w-full" onClick={saveNotes}>{locale === "ar" ? "إضافة ملاحظة" : "Add note"}</Button>
              {!demo && <CustomerTimeline id={sel.id} />}
              {canErase && !demo && (
                <div className="mt-8 rounded-2xl border border-rose-400/30 p-4">
                  <p className="text-sm font-semibold text-rose-300">{locale === "ar" ? "حذف بيانات العميل" : "Erase customer data"}</p>
                  <p className="mt-1 text-xs text-muted">{locale === "ar" ? "يحذف الرسائل والملاحظات والذاكرة والوسوم والفرص البيعية. تبقى المواعيد والطلبات والمحادثات بدون أي بيانات تعريفية. لا يمكن التراجع." : "Deletes messages, notes, memory, tags and leads. Appointments, orders and conversations are kept without any identifying data. This can't be undone."}</p>
                  {erase?.id === sel.id ? (
                    <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); doErase(); }}>
                      <label className="label" htmlFor="erase-confirm">{locale === "ar" ? "اكتب ERASE للتأكيد" : "Type ERASE to confirm"}</label>
                      <input id="erase-confirm" dir="ltr" autoComplete="off" className="input" value={erase.typed} onChange={(e) => setErase({ ...erase, typed: e.target.value })} />
                      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setErase(null)}>{t.common.cancel}</Button><Button type="submit" variant="danger" disabled={erase.typed !== "ERASE" || erase.busy}>{locale === "ar" ? "حذف نهائي" : "Erase permanently"}</Button></div>
                    </form>
                  ) : <Button className="mt-3" variant="danger" size="sm" onClick={() => setErase({ id: sel.id, name: sel.name, typed: "", busy: false })}><Trash2 className="h-4 w-4" />{locale === "ar" ? "حذف بيانات هذا العميل" : "Erase this customer's data"}</Button>}
                </div>
              )}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
