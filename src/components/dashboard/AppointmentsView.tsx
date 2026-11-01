"use client";
import { CalendarCheck, CalendarDays, Plus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, statusTone } from "@/components/ui/primitives";
import { ErrorNote, useApi, useMutate, useTr } from "@/components/os/shared";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDate } from "@/lib/utils";

type Appt = { id: string; kind: string; starts_at: string; ends_at: string | null; party_size: number | null; status: string; notes: string | null; customer: { id: string; name: string | null; phone: string | null } | null; bookedBy: string | null };
const STATUSES = ["pending", "confirmed", "completed", "no_show", "canceled"] as const;
const STATUS_AR: Record<string, string> = { pending: "بانتظار التأكيد", confirmed: "مؤكد", completed: "تم", no_show: "لم يحضر", canceled: "ملغي" };
const KIND_AR: Record<string, string> = { appointment: "موعد", reservation: "حجز", viewing: "معاينة", callback: "معاودة اتصال" };

/** Local "YYYY-MM-DDTHH:mm" for <input type=datetime-local>, converted to ISO with the browser offset on submit. */
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function AppointmentsView({ demo, canEdit }: { demo: boolean; canEdit: boolean }) {
  const tr = useTr();
  const { locale } = useI18n();
  const mutate = useMutate();
  const [filter, setFilter] = useState<string>("all");
  const { data, error, loading, reload } = useApi<{ appointments: Appt[]; demo?: boolean }>(`/api/appointments${filter !== "all" ? `?status=${filter}` : ""}`);
  const [form, setForm] = useState<null | { customer_name: string; phone: string; starts_at: string; duration_min: number; kind: string; party_size: string; notes: string }>(null);
  const [resched, setResched] = useState<{ id: string; at: string } | null>(null);
  const label = (st: string) => (locale === "ar" ? STATUS_AR[st] ?? st : st.replace("_", " "));

  const byDay = useMemo(() => {
    const m = new Map<string, Appt[]>();
    for (const a of data?.appointments ?? []) {
      const k = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(new Date(a.starts_at));
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return [...m.entries()];
  }, [data]);

  return (
    <>
      <PageHeader title={tr("Appointments", "المواعيد")} subtitle={tr("Bookings made by your team and your AI employees.", "الحجوزات التي يسجّلها فريقك وموظفوك الأذكياء.")} demo={demo}
        actions={canEdit && <Button onClick={() => setForm({ customer_name: "", phone: "", starts_at: toLocalInput(new Date(Date.now() + 3600000)), duration_min: 30, kind: "appointment", party_size: "", notes: "" })}><Plus className="h-4 w-4" />{tr("New appointment", "موعد جديد")}</Button>} />
      <ErrorNote error={error} />
      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {["all", ...STATUSES].map((st) => <button key={st} onClick={() => setFilter(st)} className={cn("shrink-0 rounded-xl border px-3 py-2 text-xs", filter === st ? "border-violet bg-violet/15" : "border-line text-muted")}>{st === "all" ? tr("All", "الكل") : label(st)}</button>)}
      </div>
      {loading ? <Skeleton className="h-64" /> : demo || data?.demo ? (
        <EmptyState icon={<CalendarDays className="h-6 w-6" />} title={tr("Appointments are stored in your database", "المواعيد تُحفظ في قاعدة بياناتك")} body={tr("Demo mode has no appointment data. Connect Supabase to create and manage appointments.", "لا توجد مواعيد في الوضع التجريبي. اربط Supabase لإنشاء المواعيد وإدارتها.")} />
      ) : byDay.length === 0 ? (
        <EmptyState icon={<CalendarCheck className="h-6 w-6" />} title={tr("No appointments in the next 30 days", "لا توجد مواعيد خلال ٣٠ يوماً القادمة")} body={tr("New bookings from calls, WhatsApp or your team appear here.", "تظهر هنا الحجوزات من المكالمات وواتساب وفريقك.")} />
      ) : (
        <div className="space-y-5">
          {byDay.map(([day, list]) => (
            <section key={day}>
              <h2 className="mb-2 text-sm font-semibold text-muted">{formatDate(`${day}T12:00:00+03:00`, locale, { dateStyle: "full", timeStyle: undefined })}</h2>
              <div className="space-y-2">
                {list.map((a) => (
                  <Card key={a.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="w-16 shrink-0 font-display text-lg font-semibold tabular-nums" dir="ltr">{formatDate(a.starts_at, locale, { dateStyle: undefined, timeStyle: "short" })}</div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{a.customer?.name ?? tr("Unknown customer", "عميل غير معروف")} <span className="text-xs text-muted" dir="ltr">{a.customer?.phone}</span></p>
                      <p className="text-xs text-muted">{locale === "ar" ? KIND_AR[a.kind] ?? a.kind : a.kind}{a.party_size ? <> · <Users className="inline h-3 w-3" /> {a.party_size}</> : null}{a.bookedBy ? ` · ${tr("booked by", "حجزه")} ${a.bookedBy}` : ""}{a.notes ? ` · ${a.notes}` : ""}</p>
                    </div>
                    {canEdit ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <select aria-label={tr("Status", "الحالة")} className="input w-auto py-1.5 text-xs" value={a.status} onChange={async (e) => { if (await mutate(`/api/appointments/${a.id}`, "PATCH", { status: e.target.value }, tr("Updated", "تم التحديث"))) reload(); }}>
                          {STATUSES.map((st) => <option key={st} value={st}>{label(st)}</option>)}
                        </select>
                        <Button size="sm" variant="ghost" onClick={() => setResched({ id: a.id, at: toLocalInput(new Date(a.starts_at)) })}>{tr("Reschedule", "تغيير الموعد")}</Button>
                      </div>
                    ) : <Badge tone={statusTone(a.status === "no_show" ? "missed" : a.status)}>{label(a.status)}</Badge>}
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {(form || resched) && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onClick={() => { setForm(null); setResched(null); }}>
          <form onClick={(e) => e.stopPropagation()} className="glass my-8 w-full max-w-md space-y-3 bg-ink-2 p-6" onSubmit={async (e) => {
            e.preventDefault();
            if (resched) {
              if (await mutate(`/api/appointments/${resched.id}`, "PATCH", { starts_at: new Date(resched.at).toISOString() }, tr("Rescheduled", "تم تغيير الموعد"))) { setResched(null); reload(); }
              return;
            }
            const r = await mutate("/api/appointments", "POST", { customer_name: form!.customer_name, phone: form!.phone, starts_at: new Date(form!.starts_at).toISOString(), duration_min: form!.duration_min, kind: form!.kind, party_size: form!.party_size ? Number(form!.party_size) : undefined, notes: form!.notes || undefined }, tr("Appointment created", "تم إنشاء الموعد"));
            if (r) { setForm(null); reload(); }
          }}>
            <h3 className="font-display text-lg font-semibold">{resched ? tr("Reschedule", "تغيير الموعد") : tr("New appointment", "موعد جديد")}</h3>
            {resched ? (
              <div><label className="label" htmlFor="ap-re">{tr("New date and time", "التاريخ والوقت الجديد")}</label><input id="ap-re" type="datetime-local" required className="input" value={resched.at} onChange={(e) => setResched({ ...resched, at: e.target.value })} /></div>
            ) : (
              <>
                <div><label className="label" htmlFor="ap-name">{tr("Customer name", "اسم العميل")}</label><input id="ap-name" required maxLength={120} dir="auto" className="input" value={form!.customer_name} onChange={(e) => setForm({ ...form!, customer_name: e.target.value })} /></div>
                <div><label className="label" htmlFor="ap-phone">{tr("Phone", "الهاتف")}</label><input id="ap-phone" required dir="ltr" pattern="\+?[0-9 ]{6,20}" className="input" value={form!.phone} onChange={(e) => setForm({ ...form!, phone: e.target.value })} placeholder="+965 ..." /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label" htmlFor="ap-at">{tr("Date and time", "التاريخ والوقت")}</label><input id="ap-at" type="datetime-local" required className="input" value={form!.starts_at} onChange={(e) => setForm({ ...form!, starts_at: e.target.value })} /></div>
                  <div><label className="label" htmlFor="ap-dur">{tr("Duration (min)", "المدة (دقيقة)")}</label><input id="ap-dur" type="number" min={5} max={600} className="input" value={form!.duration_min} onChange={(e) => setForm({ ...form!, duration_min: Number(e.target.value) })} /></div>
                  <div><label className="label" htmlFor="ap-kind">{tr("Type", "النوع")}</label>
                    <select id="ap-kind" className="input" value={form!.kind} onChange={(e) => setForm({ ...form!, kind: e.target.value })}>{["appointment", "reservation", "viewing", "callback"].map((k) => <option key={k} value={k}>{locale === "ar" ? KIND_AR[k] : k}</option>)}</select></div>
                  <div><label className="label" htmlFor="ap-party">{tr("Party size", "عدد الأشخاص")}</label><input id="ap-party" type="number" min={1} max={100} className="input" value={form!.party_size} onChange={(e) => setForm({ ...form!, party_size: e.target.value })} /></div>
                </div>
                <div><label className="label" htmlFor="ap-notes">{tr("Notes", "ملاحظات")}</label><input id="ap-notes" dir="auto" maxLength={1000} className="input" value={form!.notes} onChange={(e) => setForm({ ...form!, notes: e.target.value })} /></div>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => { setForm(null); setResched(null); }}>{tr("Cancel", "إلغاء")}</Button><Button type="submit">{tr("Save", "حفظ")}</Button></div>
          </form>
        </div>
      )}
    </>
  );
}
