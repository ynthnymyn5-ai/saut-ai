"use client";
import { Building2, Mail, Trash2, User, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, ConfirmDialog, Skeleton } from "@/components/ui/primitives";
import { ErrorNote, useApi, useMutate, useTr } from "@/components/os/shared";
import { useI18n, useSetLocale } from "@/lib/i18n/client";
import { ROLE_LABELS, type MemberRole } from "@/lib/rbac";

/* ─────────────── Profile ─────────────── */
export function ProfileCard() {
  const tr = useTr();
  const mutate = useMutate();
  const { setLocale } = useSetLocale();
  const { data, loading, error } = useApi<{ profile: { email: string; full_name: string | null; phone: string | null; locale: "ar" | "en" } }>("/api/profile");
  const [f, setF] = useState({ full_name: "", phone: "", locale: "ar" as "ar" | "en" });
  useEffect(() => { if (data?.profile) setF({ full_name: data.profile.full_name ?? "", phone: data.profile.phone ?? "", locale: data.profile.locale }); }, [data]);
  return (
    <Card>
      <div className="mb-5 flex items-center gap-2"><User className="h-5 w-5 text-electric" /><h2 className="font-semibold">{tr("Your profile", "ملفك الشخصي")}</h2></div>
      <ErrorNote error={error} />
      {loading ? <Skeleton className="h-40" /> : (
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          const r = await mutate("/api/profile", "PATCH", f, tr("Profile saved", "تم حفظ الملف"));
          if (r && data?.profile.locale !== f.locale) setLocale(f.locale);
        }}>
          <div className="sm:col-span-2"><label className="label" htmlFor="pf-email">{tr("Email", "البريد الإلكتروني")}</label><input id="pf-email" disabled dir="ltr" className="input opacity-70" value={data?.profile.email ?? ""} /></div>
          <div><label className="label" htmlFor="pf-name">{tr("Full name", "الاسم الكامل")}</label><input id="pf-name" required maxLength={120} dir="auto" className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
          <div><label className="label" htmlFor="pf-phone">{tr("Phone", "الهاتف")}</label><input id="pf-phone" dir="ltr" pattern="\+?[0-9 ]{6,20}" className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+965 ..." /></div>
          <div><label className="label" htmlFor="pf-lang">{tr("Interface language", "لغة الواجهة")}</label>
            <select id="pf-lang" className="input" value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value as "ar" | "en" })}><option value="ar">العربية</option><option value="en">English</option></select></div>
          <div className="flex items-end"><Button type="submit">{tr("Save profile", "حفظ الملف")}</Button></div>
          <EmailAlertsToggle />
          <p className="text-xs text-muted sm:col-span-2">{tr("To change your password, sign out and use “Forgot your password?”.", "لتغيير كلمة المرور، سجّل الخروج واستخدم «نسيت كلمة المرور؟».")}</p>
        </form>
      )}
    </Card>
  );
}

/* ─────────────── Organization ─────────────── */
type Org = { name: string; industry: string; timezone: string; preferred_language: "ar" | "en"; contact_email: string | null; contact_phone: string | null; address: string | null; country: string; currency: string };
export function OrganizationCard() {
  const tr = useTr();
  const { t } = useI18n();
  const mutate = useMutate();
  const { data, loading, error, reload } = useApi<{ organization: Org; subscription: { plan: string | null; status: string; trial_ends_at?: string | null } | null; role: MemberRole }>("/api/organization");
  const [f, setF] = useState<Org | null>(null);
  useEffect(() => { if (data?.organization) setF(data.organization); }, [data]);
  const canEdit = data?.role === "owner" || data?.role === "admin";
  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-center gap-2"><Building2 className="h-5 w-5 text-electric" /><h2 className="font-semibold">{tr("Business profile", "ملف النشاط")}</h2>
        {data?.subscription && <Badge tone={data.subscription.status === "active" ? "green" : "blue"} className="ms-auto">{data.subscription.plan ?? "—"} · {data.subscription.status}</Badge>}
      </div>
      <ErrorNote error={error} />
      {loading || !f ? <Skeleton className="h-48" /> : (
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); if (await mutate("/api/organization", "PATCH", { name: f.name, industry: f.industry, timezone: f.timezone, preferred_language: f.preferred_language, contact_email: f.contact_email ?? "", contact_phone: f.contact_phone ?? "", address: f.address ?? "" }, tr("Business profile saved", "تم حفظ ملف النشاط"))) reload(); }}>
          <fieldset disabled={!canEdit} className="contents">
            <div className="sm:col-span-2"><label className="label" htmlFor="org-name">{tr("Business name", "اسم النشاط")}</label><input id="org-name" required minLength={2} maxLength={120} dir="auto" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><label className="label" htmlFor="org-ind">{tr("Industry", "القطاع")}</label>
              <select id="org-ind" className="input" value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })}>{(Object.keys(t.industries.list) as (keyof typeof t.industries.list)[]).map((k) => <option key={k} value={k}>{t.industries.list[k]}</option>)}</select></div>
            <div><label className="label" htmlFor="org-tz">{tr("Time zone", "المنطقة الزمنية")}</label>
              <select id="org-tz" className="input" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{["Asia/Kuwait", "Asia/Riyadh", "Asia/Dubai", "Asia/Qatar", "Asia/Bahrain", "Asia/Muscat", "UTC"].map((z) => <option key={z}>{z}</option>)}</select></div>
            <div><label className="label" htmlFor="org-email">{tr("Contact email", "بريد التواصل")}</label><input id="org-email" type="email" dir="ltr" className="input" value={f.contact_email ?? ""} onChange={(e) => setF({ ...f, contact_email: e.target.value })} /></div>
            <div><label className="label" htmlFor="org-phone">{tr("Contact phone", "هاتف التواصل")}</label><input id="org-phone" dir="ltr" pattern="\+?[0-9 ]{6,20}" className="input" value={f.contact_phone ?? ""} onChange={(e) => setF({ ...f, contact_phone: e.target.value })} /></div>
            <div><label className="label" htmlFor="org-lang">{tr("Preferred language", "اللغة المفضلة")}</label>
              <select id="org-lang" className="input" value={f.preferred_language} onChange={(e) => setF({ ...f, preferred_language: e.target.value as "ar" | "en" })}><option value="ar">العربية</option><option value="en">English</option></select></div>
            <div><label className="label">{tr("Country · currency", "الدولة · العملة")}</label><p className="input opacity-70" dir="ltr">{f.country} · {f.currency}</p></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="org-addr">{tr("Address", "العنوان")}</label><input id="org-addr" dir="auto" maxLength={300} className="input" value={f.address ?? ""} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
          </fieldset>
          {canEdit ? <div><Button type="submit">{tr("Save business profile", "حفظ ملف النشاط")}</Button></div> : <p className="text-xs text-muted sm:col-span-2">{tr("Only owners and admins can edit the business profile.", "فقط المالك ومدير النظام يمكنهم تعديل ملف النشاط.")}</p>}
        </form>
      )}
    </Card>
  );
}

/* ─────────────── Team ─────────────── */
type Member = { id: string; user_id: string; role: MemberRole; full_name: string | null; email: string; created_at: string };
export function TeamCard() {
  const tr = useTr();
  const { locale } = useI18n();
  const mutate = useMutate();
  const { data, loading, error, reload } = useApi<{ members: Member[]; me: string; myRole: MemberRole; assignable?: MemberRole[] }>("/api/members");
  const [invite, setInvite] = useState({ email: "", role: "employee" as MemberRole });
  const [remove, setRemove] = useState<Member | null>(null);
  const assignable = data?.assignable ?? [];
  const label = (r: MemberRole) => ROLE_LABELS[r][locale];
  return (
    <Card>
      <div className="mb-5 flex items-center gap-2"><Users className="h-5 w-5 text-electric" /><h2 className="font-semibold">{tr("Team & roles", "الفريق والصلاحيات")}</h2></div>
      <ErrorNote error={error} />
      {loading ? <Skeleton className="h-40" /> : (
        <>
          <ul className="space-y-2">
            {(data?.members ?? []).map((m) => {
              const isMe = m.user_id === data?.me;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{m.full_name ?? m.email}{isMe && <span className="text-muted"> · {tr("you", "أنت")}</span>}</p><p className="truncate text-xs text-muted" dir="ltr">{m.email}</p></div>
                  {assignable.length && !isMe && (m.role !== "owner" || data?.myRole === "owner") ? (
                    <select aria-label={tr("Role", "الدور")} className="input w-auto py-1.5 text-xs" value={m.role === "agent" ? "employee" : m.role} onChange={async (e) => { if (await mutate(`/api/members/${m.id}`, "PATCH", { role: e.target.value }, tr("Role updated", "تم تحديث الدور"))) reload(); }}>
                      {assignable.map((r) => <option key={r} value={r}>{label(r)}</option>)}
                    </select>
                  ) : <Badge tone="violet">{label(m.role)}</Badge>}
                  {(isMe || (assignable.length > 0 && (m.role !== "owner" || data?.myRole === "owner"))) && (
                    <button type="button" onClick={() => setRemove(m)} className="rounded-lg p-2 text-rose-300 hover:bg-rose-400/10" aria-label={isMe ? tr("Leave organization", "مغادرة النشاط") : tr("Remove member", "إزالة العضو")}><Trash2 className="h-4 w-4" /></button>
                  )}
                </li>
              );
            })}
          </ul>
          {assignable.length > 0 && (
            <form className="mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={async (e) => { e.preventDefault(); const r = await mutate("/api/members", "POST", invite); if (r) { setInvite({ email: "", role: "employee" }); reload(); } }}>
              <div className="relative flex-1"><Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input id="inv-email" type="email" required dir="ltr" className="input ps-9" placeholder="name@company.com" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} aria-label={tr("Email to invite", "البريد المراد دعوته")} /></div>
              <select aria-label={tr("Role", "الدور")} className="input sm:w-40" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as MemberRole })}>{assignable.map((r) => <option key={r} value={r}>{label(r)}</option>)}</select>
              <Button type="submit"><UserPlus className="h-4 w-4" />{tr("Invite", "دعوة")}</Button>
            </form>
          )}
          <dl className="mt-5 grid gap-1 text-xs text-muted sm:grid-cols-2">
            {([["owner", "Everything, including ownership and billing", "كل شيء، بما فيه الملكية والفوترة"], ["admin", "Business profile, team, integrations, billing", "ملف النشاط، الفريق، التكاملات، الفوترة"], ["manager", "AI employees, automations, analytics, approvals", "الموظفون الأذكياء، الأتمتة، التحليلات، الموافقات"], ["employee", "Customers, conversations, appointments", "العملاء، المحادثات، المواعيد"], ["viewer", "Read-only", "قراءة فقط"]] as const).map(([r, en, ar]) => <div key={r}><dt className="inline font-semibold text-white/80">{label(r)}: </dt><dd className="inline">{tr(en, ar)}</dd></div>)}
          </dl>
        </>
      )}
      <ConfirmDialog open={!!remove} danger onClose={() => setRemove(null)}
        title={remove?.user_id === data?.me ? tr("Leave this organization?", "مغادرة هذا النشاط؟") : tr(`Remove ${remove?.full_name ?? remove?.email}?`, `إزالة ${remove?.full_name ?? remove?.email}؟`)}
        body={tr("They lose access to this business immediately. Their SAUT AI account is not deleted.", "يفقد الوصول لهذا النشاط فوراً. لا يُحذف حسابه في SAUT AI.")}
        onConfirm={async () => { if (!remove) return; const self = remove.user_id === data?.me; if (await mutate(`/api/members/${remove.id}`, "DELETE", undefined, tr("Done", "تم"))) { if (self) window.location.href = "/onboarding"; else reload(); } }} />
    </Card>
  );
}

/* ─────────────── Delete account (danger zone) ─────────────── */
type DeletionPlan = { delete: { id: string; name: string }[]; block: { id: string; name: string; reason: "sole_owner" | "subscription_active" }[]; leave: { id: string; name: string }[] };

export function DeleteAccountCard({ demo }: { demo: boolean }) {
  const tr = useTr();
  const [open, setOpen] = useState(false);
  const plan = useApi<DeletionPlan>(open && !demo ? "/api/account" : null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const p = plan.data;
  return (
    <Card className="border-rose-400/30">
      <div className="mb-3 flex items-center gap-2"><Trash2 className="h-5 w-5 text-rose-300" /><h2 className="font-semibold">{tr("Delete my account", "حذف حسابي")}</h2></div>
      <p className="text-sm text-muted">{tr("Permanently deletes your login. Businesses where you are the only member are deleted with all their data. This can't be undone.", "يحذف حساب الدخول نهائياً. الأنشطة التي أنت عضوها الوحيد تُحذف مع كل بياناتها. لا يمكن التراجع.")}</p>
      {!open ? <Button className="mt-4" variant="danger" size="sm" onClick={() => setOpen(true)}>{tr("Start account deletion", "بدء حذف الحساب")}</Button> : demo ? (
        <p className="mt-4 text-sm text-amber-200">{tr("Demo mode: nothing can be deleted.", "وضع تجريبي: لا يمكن حذف شيء.")}</p>
      ) : plan.loading || !p ? <Skeleton className="mt-4 h-24" /> : (
        <div className="mt-4 space-y-3 text-sm">
          <ErrorNote error={plan.error} />
          {p.delete.length > 0 && <p>{tr("Will be deleted with all data:", "سيُحذف مع كل بياناته:")} <b>{p.delete.map((o) => o.name).join("، ")}</b></p>}
          {p.leave.length > 0 && <p className="text-muted">{tr("You will leave (their data stays):", "ستغادر (تبقى بياناتهم):")} {p.leave.map((o) => o.name).join("، ")}</p>}
          {p.block.length > 0 ? (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-amber-100">
              <p className="font-semibold">{tr("Before you can delete your account:", "قبل حذف حسابك:")}</p>
              <ul className="mt-1 list-disc ps-5">{p.block.map((b) => <li key={b.id}>{b.name} — {b.reason === "sole_owner" ? tr("make another member an owner (Settings → Team), or remove the other members", "اجعل عضواً آخر مالكاً (الإعدادات ← الفريق) أو أزل الأعضاء الآخرين") : tr("cancel the subscription in Billing", "ألغِ الاشتراك من صفحة الفوترة")}</li>)}</ul>
            </div>
          ) : (
            <form className="space-y-2" onSubmit={async (e) => {
              e.preventDefault(); if (busy || typed !== "DELETE") return;
              setBusy(true); setErr(null);
              const r = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) });
              const j = await r.json().catch(() => ({}));
              if (!r.ok) { setBusy(false); setErr(j?.error?.message ?? tr("Something went wrong", "حدث خطأ")); return; }
              window.location.href = "/?account=deleted";
            }}>
              <label className="label" htmlFor="del-confirm">{tr("Type DELETE to confirm", "اكتب DELETE للتأكيد")}</label>
              <input id="del-confirm" dir="ltr" autoComplete="off" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} />
              {err && <p className="text-rose-300" role="alert">{err}</p>}
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => { setOpen(false); setTyped(""); }}>{tr("Cancel", "إلغاء")}</Button><Button type="submit" variant="danger" disabled={busy || typed !== "DELETE"}>{busy ? tr("Deleting…", "جارٍ الحذف…") : tr("Delete permanently", "حذف نهائي")}</Button></div>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}

/* ─────────────── Activity log (owners/admins) ─────────────── */
export function ActivityLogCard() {
  const tr = useTr();
  const { locale } = useI18n();
  const { data, loading, error } = useApi<{ entries: { id: number; action: string; target: string | null; at: string; actor: string }[]; demo?: boolean }>("/api/audit");
  return (
    <Card>
      <div className="mb-4 flex items-center gap-2"><Building2 className="h-5 w-5 text-electric" /><h2 className="font-semibold">{tr("Activity log", "سجل النشاط")}</h2></div>
      <p className="mb-3 text-xs text-muted">{tr("Sensitive actions in this business: who did what, and when.", "الإجراءات الحساسة في هذا النشاط: من فعل ماذا ومتى.")}</p>
      <ErrorNote error={error} />
      {loading ? <Skeleton className="h-40" /> : !data?.entries.length ? <p className="text-sm text-muted">{tr("Nothing recorded yet.", "لا يوجد شيء مسجّل بعد.")}</p> : (
        <ul className="max-h-80 divide-y divide-line overflow-y-auto text-sm">
          {data.entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><code className="rounded bg-white/5 px-1.5 py-0.5 text-xs" dir="ltr">{e.action}</code> <span className="text-muted">· {e.actor}</span></span>
              <span className="text-xs text-muted" dir="ltr">{new Intl.DateTimeFormat(locale === "ar" ? "ar-KW" : "en-GB", { dateStyle: "short", timeStyle: "short" }).format(new Date(e.at))}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ─────────────── Failed / queued deliveries ─────────────── */
type Delivery = { id: string; kind: "whatsapp_text" | "email"; status: "pending" | "dead"; attempts: number; maxAttempts: number; error: string | null; nextAt: string; at: string; to: string; preview: string };

export function DeliveriesCard() {
  const tr = useTr();
  const mutate = useMutate();
  const { locale } = useI18n();
  const { data, loading, error, reload } = useApi<{ jobs: Delivery[] }>("/api/deliveries", { pollMs: 30000 });
  const [busy, setBusy] = useState<string | null>(null);
  const fmt = (d: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-KW" : "en-GB", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));
  return (
    <Card id="deliveries">
      <div className="mb-2 flex items-center gap-2"><Mail className="h-5 w-5 text-electric" /><h2 className="font-semibold">{tr("Message deliveries", "تسليم الرسائل")}</h2></div>
      <p className="mb-3 text-xs text-muted">{tr("WhatsApp replies and emails that failed for a temporary reason are retried automatically (5 tries over a few hours). Ones that still fail are listed here.", "ردود واتساب والإيميلات التي فشلت لسبب مؤقت تُعاد محاولتها تلقائياً (٥ محاولات خلال بضع ساعات). وما يفشل نهائياً يظهر هنا.")}</p>
      <ErrorNote error={error} />
      {loading ? <Skeleton className="h-24" /> : !data?.jobs.length ? <p className="text-sm text-emerald-300">{tr("Everything was delivered.", "تم تسليم كل شيء.")}</p> : (
        <ul className="divide-y divide-line text-sm">
          {data.jobs.map((j) => (
            <li key={j.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={j.status === "dead" ? "red" : "amber"}>{j.status === "dead" ? tr("Failed", "فشل") : tr(`Retrying (${j.attempts}/${j.maxAttempts})`, `إعادة المحاولة (${j.attempts}/${j.maxAttempts})`)}</Badge>
                <span className="text-xs text-muted">{j.kind === "email" ? tr("Email", "إيميل") : "WhatsApp"} · <span dir="ltr">{j.to}</span> · {fmt(j.at)}</span>
              </div>
              {j.preview && <p className="mt-1 truncate text-xs" dir="auto">{j.preview}</p>}
              {j.error && <p className="mt-1 text-xs text-rose-300" dir="auto">{j.error}</p>}
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => { setBusy(j.id); const r = await mutate("/api/deliveries", "PATCH", { id: j.id, action: "retry" }); setBusy(null); if (r) { reload(); } }}>{tr("Retry now", "أعد المحاولة الآن")}</Button>
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={async () => { setBusy(j.id); const r = await mutate("/api/deliveries", "PATCH", { id: j.id, action: "dismiss" }, tr("Dismissed", "تم التجاهل")); setBusy(null); if (r) reload(); }}>{tr("Dismiss", "تجاهل")}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function EmailAlertsToggle() {
  const tr = useTr();
  const mutate = useMutate();
  const { data, reload } = useApi<{ email: boolean; available: boolean; eligible: boolean; demo?: boolean }>("/api/profile/notifications");
  if (!data || data.demo || !data.eligible) return null;
  return (
    <label className="flex items-start gap-3 rounded-xl border border-line p-3 sm:col-span-2">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-violet" checked={data.email} onChange={async (e) => { if (await mutate("/api/profile/notifications", "PATCH", { email: e.target.checked }, tr("Saved", "تم الحفظ"))) reload(); }} />
      <span className="text-sm">{tr("Email me important alerts (new orders, messages waiting for a reply, failed deliveries, plan limits)", "أرسل لي تنبيهات مهمة بالإيميل (طلبات جديدة، رسائل بانتظار الرد، رسائل لم تُسلَّم، حدود الباقة)")}
        {!data.available && <span className="mt-0.5 block text-xs text-amber-200">{tr("Email sending isn't configured on the server yet (RESEND_API_KEY, EMAIL_FROM) — alerts stay in the app until it is.", "إرسال الإيميل غير مفعّل على الخادم بعد (RESEND_API_KEY و EMAIL_FROM) — تبقى التنبيهات داخل التطبيق حتى يتم تفعيله.")}</span>}</span>
    </label>
  );
}
