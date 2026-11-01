"use client";
import { Building, MapPin, Phone, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import { ErrorNote, useApi, useMutate, useTr } from "./shared";

type Hours = Record<string, [string, string][]>;
type Branch = { id: string; name: string; name_ar: string | null; address: string | null; phone_number: string | null; opening_hours: Hours; is_active: boolean; employees: { id: string; name: string }[]; upcomingAppointments: number };
type Resp = { demo?: boolean; branches: Branch[]; unassignedEmployees: { id: string; name: string }[] };
const DAYS: [string, string, string][] = [["sun", "Sun", "الأحد"], ["mon", "Mon", "الاثنين"], ["tue", "Tue", "الثلاثاء"], ["wed", "Wed", "الأربعاء"], ["thu", "Thu", "الخميس"], ["fri", "Fri", "الجمعة"], ["sat", "Sat", "السبت"]];

export function Branches({ canEdit, demo }: { canEdit: boolean; demo: boolean }) {
  const tr = useTr();
  const { locale } = useI18n();
  const mutate = useMutate();
  const { data, error, loading, reload } = useApi<Resp>("/api/branches");
  const [edit, setEdit] = useState<Partial<Branch> & { hours: Hours } | null>(null);
  const [del, setDel] = useState<Branch | null>(null);

  const save = async () => {
    if (!edit) return;
    const body = { name: edit.name, name_ar: edit.name_ar || undefined, address: edit.address || undefined, phone_number: edit.phone_number || (edit.id ? null : ""), opening_hours: edit.hours };
    const r = edit.id ? await mutate(`/api/branches/${edit.id}`, "PATCH", body, tr("Saved", "تم الحفظ")) : await mutate("/api/branches", "POST", body, tr("Branch created", "تم إنشاء الفرع"));
    if (r) { setEdit(null); reload(); }
  };

  return (
    <>
      <PageHeader title={tr("Branches", "الفروع")} subtitle={tr("Each branch has its own hours, number, AI employees, knowledge and analytics.", "لكل فرع أوقاته ورقمه وموظفوه الأذكياء ومعرفته وتحليلاته.")} demo={demo}
        actions={canEdit && <Button onClick={() => setEdit({ name: "", hours: {} })}><Plus className="h-4 w-4" />{tr("Add branch", "إضافة فرع")}</Button>} />
      <ErrorNote error={error} />
      {loading ? <Skeleton className="h-40" /> : !data?.branches.length ? (
        <EmptyState icon={<Building className="h-6 w-6" />} title={tr("No branches yet", "لا توجد فروع بعد")} body={demo ? tr("Demo mode: connect Supabase to manage branches.", "وضع تجريبي: اربط Supabase لإدارة الفروع.") : tr("Without branches everything applies to the whole business. Multiple branches are included in the Pro plan.", "بدون فروع ينطبق كل شيء على النشاط كاملاً. الفروع المتعددة ضمن خطة الاحترافي.")} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.branches.map((b) => (
            <Card key={b.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">{locale === "ar" && b.name_ar ? b.name_ar : b.name}</h2>
                  {b.address && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><MapPin className="h-3.5 w-3.5" />{b.address}</p>}
                  {b.phone_number && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted" dir="ltr"><Phone className="h-3.5 w-3.5" />{b.phone_number}</p>}
                </div>
                <Badge tone={b.is_active ? "green" : "gray"}>{b.is_active ? tr("Active", "نشط") : tr("Inactive", "غير نشط")}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px]">
                {DAYS.map(([k, en, ar]) => <div key={k} className="rounded-lg bg-white/[0.03] p-1.5"><p className="text-muted">{locale === "ar" ? ar.slice(0, 3) : en}</p><p className="mt-0.5 tabular-nums" dir="ltr">{b.opening_hours?.[k]?.length ? b.opening_hours[k].map(([a, z]) => `${a}–${z}`).join(" ") : Object.keys(b.opening_hours ?? {}).length ? tr("Closed", "مغلق") : "24h"}</p></div>)}
              </div>
              <div className="mt-4">
                <p className="mb-2 text-xs text-muted">{tr("AI employees", "الموظفون الأذكياء")} · {b.upcomingAppointments} {tr("upcoming appointments", "مواعيد قادمة")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {b.employees.map((e) => <button key={e.id} disabled={!canEdit} onClick={async () => { if (await mutate(`/api/branches/${b.id}`, "PATCH", { unassign_employee_ids: [e.id] })) reload(); }} className="rounded-full border border-violet/40 bg-violet/10 px-2.5 py-1 text-xs" title={tr("Remove from branch", "إزالة من الفرع")}>{e.name}{canEdit ? " ×" : ""}</button>)}
                  {canEdit && data.unassignedEmployees.length > 0 && (
                    <select aria-label={tr("Assign employee", "إسناد موظف")} className="input w-auto py-1 text-xs" value="" onChange={async (ev) => { if (ev.target.value && (await mutate(`/api/branches/${b.id}`, "PATCH", { assign_employee_ids: [ev.target.value] }, tr("Assigned", "تم الإسناد")))) reload(); }}>
                      <option value="">{tr("+ Assign employee", "+ إسناد موظف")}</option>
                      {data.unassignedEmployees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
              {canEdit && <div className="mt-4 flex gap-2"><Button size="sm" variant="outline" onClick={() => setEdit({ ...b, hours: b.opening_hours ?? {} })}>{tr("Edit", "تعديل")}</Button><Button size="sm" variant="ghost" className="text-rose-300" onClick={() => setDel(b)}><Trash2 className="h-3.5 w-3.5" /></Button></div>}
            </Card>
          ))}
        </div>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onClick={() => setEdit(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); save(); }} className="glass my-8 w-full max-w-lg space-y-3 bg-ink-2 p-6">
            <h3 className="font-display text-lg font-semibold">{edit.id ? tr("Edit branch", "تعديل الفرع") : tr("New branch", "فرع جديد")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="b-name">{tr("Name (English)", "الاسم (إنجليزي)")}</label><input id="b-name" required minLength={2} className="input" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Salmiya" /></div>
              <div><label className="label" htmlFor="b-name-ar">{tr("Name (Arabic)", "الاسم (عربي)")}</label><input id="b-name-ar" dir="rtl" className="input" value={edit.name_ar ?? ""} onChange={(e) => setEdit({ ...edit, name_ar: e.target.value })} placeholder="السالمية" /></div>
            </div>
            <div><label className="label" htmlFor="b-addr">{tr("Address", "العنوان")}</label><input id="b-addr" dir="auto" className="input" value={edit.address ?? ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></div>
            <div><label className="label" htmlFor="b-phone">{tr("Branch phone number", "رقم هاتف الفرع")}</label><input id="b-phone" dir="ltr" className="input" value={edit.phone_number ?? ""} onChange={(e) => setEdit({ ...edit, phone_number: e.target.value })} placeholder="+965 ..." /></div>
            <p className="label">{tr("Opening hours (leave a day empty = closed; all empty = always open)", "أوقات العمل (اترك اليوم فارغاً = مغلق؛ الكل فارغ = مفتوح دائماً)")}</p>
            <div className="space-y-1.5">
              {DAYS.map(([k, en, ar]) => {
                const r = edit.hours[k]?.[0] ?? ["", ""];
                const set = (i: 0 | 1, v: string) => { const n = [...r] as [string, string]; n[i] = v; const h = { ...edit.hours }; if (n[0] && n[1]) h[k] = [n]; else if (!n[0] && !n[1]) delete h[k]; else h[k] = [n]; setEdit({ ...edit, hours: h }); };
                return (
                  <div key={k} className="grid grid-cols-[72px_1fr_1fr] items-center gap-2 text-sm">
                    <span>{locale === "ar" ? ar : en}</span>
                    <input aria-label={`${en} open`} type="time" className="input py-1.5" value={r[0]} onChange={(e) => set(0, e.target.value)} />
                    <input aria-label={`${en} close`} type="time" className="input py-1.5" value={r[1]} onChange={(e) => set(1, e.target.value)} />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => setEdit(null)}>{tr("Cancel", "إلغاء")}</Button><Button type="submit">{tr("Save", "حفظ")}</Button></div>
          </form>
        </div>
      )}
      <ConfirmDialog open={!!del} danger onClose={() => setDel(null)} title={tr(`Delete ${del?.name}?`, `حذف ${del?.name}؟`)} body={tr("History stays, but it will no longer be linked to this branch.", "يبقى السجل لكنه لن يرتبط بهذا الفرع.")} onConfirm={async () => { if (del && (await mutate(`/api/branches/${del.id}`, "DELETE", undefined, tr("Deleted", "تم الحذف")))) reload(); }} />
    </>
  );
}
