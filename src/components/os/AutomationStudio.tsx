"use client";
import { Plus, Workflow, Sparkles, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import { WORKFLOW_TEMPLATES } from "@/lib/so/templates";
import { TRIGGER_LABELS } from "./automation-labels";
import { ErrorNote, timeAgo, useApi, useMutate, useTr } from "./shared";

type WF = { id: string; name: string; trigger: string; enabled: boolean; runs: number; failures: number; lastRun: string | null };

export function AutomationStudio({ canEdit, demo }: { canEdit: boolean; demo: boolean }) {
  const tr = useTr();
  const { locale } = useI18n();
  const router = useRouter();
  const mutate = useMutate();
  const { data, error, loading } = useApi<{ workflows: WF[] }>("/api/workflows");
  const create = async (body: Record<string, unknown>) => {
    const r = await mutate("/api/workflows", "POST", { ...body, locale }, tr("Automation created (disabled until you enable it)", "تم إنشاء الأتمتة (معطّلة حتى تفعّلها)"));
    if (r?.id) router.push(`/dashboard/automations/${r.id}`);
  };

  return (
    <>
      <PageHeader
        title={tr("Automation Studio", "استوديو الأتمتة")}
        subtitle={tr("When something happens → check conditions → run actions.", "عندما يحدث شيء ← تحقّق من الشروط ← نفّذ الإجراءات.")}
        demo={demo}
        actions={canEdit && <Button onClick={() => create({ name: tr("New automation", "أتمتة جديدة"), trigger: "call_received", nodes: [] })}><Plus className="h-4 w-4" />{tr("Blank automation", "أتمتة فارغة")}</Button>}
      />
      <ErrorNote error={error} />
      <h2 className="mb-3 text-sm font-semibold text-muted">{tr("Your automations", "أتمتتك")}</h2>
      {loading ? <Skeleton className="h-32" /> : !data?.workflows.length ? (
        <EmptyState icon={<Workflow className="h-6 w-6" />} title={tr("No automations yet", "لا توجد أتمتة بعد")} body={demo ? tr("Demo mode: connect Supabase to create and run automations.", "وضع تجريبي: اربط Supabase لإنشاء الأتمتة وتشغيلها.") : tr("Start from a recipe below.", "ابدأ من وصفة بالأسفل.")} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.workflows.map((w) => (
            <Link key={w.id} href={`/dashboard/automations/${w.id}`} className="glass flex items-start gap-3 p-4 transition hover:border-violet/40">
              <Workflow className="mt-0.5 h-5 w-5 text-electric" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{w.name}</p>
                <p className="text-xs text-muted">{(TRIGGER_LABELS[w.trigger] ?? [w.trigger, w.trigger])[locale === "ar" ? 1 : 0]}</p>
                <p className="mt-2 text-xs text-muted tabular-nums">{w.runs} {tr("runs", "تشغيل")}{w.lastRun ? ` · ${timeAgo(w.lastRun, locale)}` : ""}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge tone={w.enabled ? "green" : "gray"}>{w.enabled ? tr("On", "مفعّلة") : tr("Off", "معطّلة")}</Badge>
                {w.failures > 0 && <Badge tone="red"><AlertTriangle className="h-3 w-3" />{w.failures}</Badge>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-10 flex items-center gap-2 text-sm font-semibold text-muted"><Sparkles className="h-4 w-4" />{tr("Recipes", "وصفات جاهزة")}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Object.values(WORKFLOW_TEMPLATES).map((t) => (
          <Card key={t.key} className="flex flex-col p-4">
            <p className="font-semibold">{t.name[locale]}</p>
            <p className="text-xs text-muted">{(TRIGGER_LABELS[t.trigger] ?? [t.trigger, t.trigger])[locale === "ar" ? 1 : 0]} · {t.nodes.length} {tr("steps", "خطوات")}</p>
            {t.trigger === "payment_confirmed" && <p className="mt-1 text-[11px] text-amber-200">{tr("Needs a payment integration", "يتطلب ربط مزوّد دفع")}</p>}
            <div className="flex-1" />
            {canEdit && <Button size="sm" variant="outline" className="mt-3 self-start" onClick={() => create({ template_key: t.key })}>{tr("Use recipe", "استخدم الوصفة")}</Button>}
          </Card>
        ))}
      </div>
      {!canEdit && <p className="mt-4 text-xs text-muted">{tr("Only owners and admins can edit automations.", "فقط المالك والمدير يمكنهم تعديل الأتمتة.")}</p>}
    </>
  );
}
