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
