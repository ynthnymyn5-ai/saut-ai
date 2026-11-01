import { DailyChart, MonthlyChart } from "@/components/dashboard/Charts";
import { Card, PageHeader } from "@/components/ui/primitives";
import { requirePageSession } from "@/lib/auth";
import { getOverview } from "@/lib/data";
import { getDict } from "@/lib/i18n/server";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const s = await requirePageSession();
  const d = await getOverview(s);
  const { t, locale } = await getDict();
  const ar = locale === "ar";
  const answerRate = d.stats.totalCalls ? Math.round((d.stats.answered / d.stats.totalCalls) * 100) : 0;
  const channels = d.demo
    ? [["Phone", 58], ["WhatsApp", 27], ["Web chat", 15]]
    : [];
  const intents = d.demo
    ? [[ar ? "حجوزات" : "Bookings", 41], [ar ? "أوقات الدوام" : "Opening hours", 22], [ar ? "المنيو والأسعار" : "Menu & prices", 18], [ar ? "التوصيل" : "Delivery", 11], [ar ? "شكاوى (محوّلة)" : "Complaints (transferred)", 8]]
    : [];
  return (
    <>
      <PageHeader title={t.dash.nav.analytics} demo={d.demo} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-muted">{ar ? "نسبة الرد" : "Answer rate"}</p><p className="mt-2 font-display text-3xl font-semibold">{answerRate}%</p></Card>
        <Card><p className="text-sm text-muted">{ar ? "متوسط مدة المكالمة" : "Avg. call length"}</p><p className="mt-2 font-display text-3xl font-semibold">{d.demo ? "2:14" : "—"}</p></Card>
        <Card><p className="text-sm text-muted">{ar ? "نسبة التحويل لموظف" : "Human transfer rate"}</p><p className="mt-2 font-display text-3xl font-semibold">{d.demo ? "6.8%" : "—"}</p></Card>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card><h2 className="mb-4 font-semibold">{t.dash.daily}</h2><DailyChart data={d.daily} /></Card>
        <Card><h2 className="mb-4 font-semibold">{t.dash.monthly}</h2><MonthlyChart data={d.monthly} /></Card>
        {[[ar ? "القنوات" : "Channels", channels], [ar ? "أسباب التواصل" : "Top intents", intents]].map(([title, rows]) => (
          <Card key={title as string}>
            <h2 className="mb-4 font-semibold">{title as string}</h2>
            {(rows as [string, number][]).length === 0 ? <p className="text-sm text-muted">{t.dash.empty}</p> : (
              <ul className="space-y-3">{(rows as [string, number][]).map(([l, v]) => (
                <li key={l}><div className="mb-1 flex justify-between text-sm"><span>{l}</span><span className="text-muted">{v}%</span></div><div className="h-2 rounded-full bg-white/5"><div className="h-full rounded-full bg-brand-gradient" style={{ width: `${v}%` }} /></div></li>
              ))}</ul>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
