"use client";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { useMutate, useTr } from "./shared";

/** "Add customer" button + modal (POST /api/customers). */
export function NewCustomerButton({ demo }: { demo: boolean }) {
  const tr = useTr();
  const router = useRouter();
  const mutate = useMutate();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ fullName: "", phone: "", email: "", marketingConsent: false });
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{tr("Add customer", "إضافة عميل")}</Button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} className="glass w-full max-w-md space-y-3 bg-ink-2 p-6" onSubmit={async (e) => {
            e.preventDefault();
            const r = await mutate("/api/customers", "POST", f, demo ? undefined : tr("Customer added", "تمت إضافة العميل"));
            if (r) { setOpen(false); setF({ fullName: "", phone: "", email: "", marketingConsent: false }); router.refresh(); }
          }}>
            <h3 className="font-display text-lg font-semibold">{tr("Add customer", "إضافة عميل")}</h3>
            <div><label className="label" htmlFor="nc-name">{tr("Full name", "الاسم الكامل")}</label><input id="nc-name" dir="auto" maxLength={120} className="input" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div>
            <div><label className="label" htmlFor="nc-phone">{tr("Phone (required)", "الهاتف (مطلوب)")}</label><input id="nc-phone" required dir="ltr" pattern="\+?[0-9 ]{6,20}" className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+965 ..." /></div>
            <div><label className="label" htmlFor="nc-email">{tr("Email", "البريد الإلكتروني")}</label><input id="nc-email" type="email" dir="ltr" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-violet" checked={f.marketingConsent} onChange={(e) => setF({ ...f, marketingConsent: e.target.checked })} />{tr("Customer agreed to receive marketing messages", "وافق العميل على استلام الرسائل التسويقية")}</label>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>{tr("Cancel", "إلغاء")}</Button><Button type="submit">{tr("Save", "حفظ")}</Button></div>
          </form>
        </div>
      )}
    </>
  );
}

/** Inline edit of a customer's contact details inside the CRM drawer (PATCH /api/customers/[id]). */
export function CustomerEditor({ id, name, phone }: { id: string; name: string; phone: string }) {
  const tr = useTr();
  const router = useRouter();
  const mutate = useMutate();
  const [f, setF] = useState({ full_name: name === "—" ? "" : name, phone, email: "" });
  return (
    <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
      e.preventDefault();
      const body: Record<string, unknown> = { full_name: f.full_name || null, phone: f.phone };
      if (f.email) body.email = f.email;
      if (await mutate(`/api/customers/${id}`, "PATCH", body, tr("Customer updated", "تم تحديث العميل"))) router.refresh();
    }}>
      <div><label className="label" htmlFor={`ce-name-${id}`}>{tr("Name", "الاسم")}</label><input id={`ce-name-${id}`} dir="auto" maxLength={120} className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
      <div><label className="label" htmlFor={`ce-phone-${id}`}>{tr("Phone", "الهاتف")}</label><input id={`ce-phone-${id}`} required dir="ltr" pattern="\+?[0-9 ]{6,20}" className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor={`ce-email-${id}`}>{tr("Email", "البريد الإلكتروني")}</label><input id={`ce-email-${id}`} type="email" dir="ltr" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder={tr("Leave empty to keep current", "اتركه فارغاً للإبقاء على الحالي")} /></div>
      <div><Button type="submit" variant="outline" size="sm">{tr("Save details", "حفظ البيانات")}</Button></div>
    </form>
  );
}
