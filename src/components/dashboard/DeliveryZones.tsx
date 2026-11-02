"use client";
import { MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { ErrorNote, useMutate, useTr } from "@/components/os/shared";
import { useI18n } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/payments/money";

type Zone = { id: string; name: string; areas: string[]; fee: number; min_order: number; is_active: boolean };
type Draft = { id?: string; name: string; areas: string; fee: string; min_order: string; is_active: boolean };

/** Delivery areas: each zone has a fee and an optional minimum order. The AI and the order form use these. */
export function DeliveryZones({ canEdit, zones, error, onChange }: { canEdit: boolean; zones: Zone[] | null; error: string | null; onChange: () => void }) {
  const tr = useTr();
  const { locale } = useI18n();
  const mutate = useMutate();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const money = (v: number) => formatMoney(Number(v), "KWD", locale);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    const body = {
      name: draft.name.trim(),
      areas: draft.areas.split(/[,،\n]/).map((a) => a.trim()).filter(Boolean),
      fee: Number(draft.fee || 0),
      min_order: Number(draft.min_order || 0),
      is_active: draft.is_active,
    };
    const r = draft.id
      ? await mutate(`/api/delivery-zones/${draft.id}`, "PATCH", body, tr("Area updated", "تم تحديث المنطقة"))
      : await mutate("/api/delivery-zones", "POST", body, tr("Area added", "تمت إضافة المنطقة"));
    setBusy(false);
    if (r) { setDraft(null); onChange(); }
  }

  async function toggle(z: Zone) {
    if (await mutate(`/api/delivery-zones/${z.id}`, "PATCH", { is_active: !z.is_active }, z.is_active ? tr("Area paused", "تم إيقاف المنطقة") : tr("Area enabled", "تم تفعيل المنطقة"))) onChange();
  }

  return (
    <div className="space-y-4">
      <ErrorNote error={error} />
      <Card className="p-4 text-sm text-muted">
        {tr(
          "Add the areas you deliver to with a fee for each. When at least one area is active, delivery orders (from staff or the AI) must be inside one of them; the fee is added to the order total. With no areas, delivery is free and unrestricted.",
          "أضف المناطق اللي توصّل لها مع رسوم كل منطقة. إذا فيه منطقة وحدة مفعّلة على الأقل، لازم يكون أي طلب توصيل (من الموظف أو الموظف الذكي) داخل وحدة منها، وتنضاف الرسوم على المجموع. إذا ما فيه مناطق، التوصيل بدون رسوم وبدون قيود.",
        )}
      </Card>
      {canEdit && !draft && (
        <Button onClick={() => setDraft({ name: "", areas: "", fee: "", min_order: "", is_active: true })}><Plus className="h-4 w-4" />{tr("Add area", "إضافة منطقة")}</Button>
      )}
      {draft && (
        <Card className="p-4">
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="z-name">{tr("Zone name", "اسم المنطقة")}</label><input id="z-name" required dir="auto" maxLength={80} className="input" placeholder={tr("e.g. Salmiya", "مثال: السالمية")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div><label className="label" htmlFor="z-areas">{tr("Also covers (comma separated)", "تشمل أيضاً (افصل بفاصلة)")}</label><input id="z-areas" dir="auto" className="input" placeholder={tr("Hawally, Jabriya", "حولي، الجابرية")} value={draft.areas} onChange={(e) => setDraft({ ...draft, areas: e.target.value })} /></div>
            <div><label className="label" htmlFor="z-fee">{tr("Delivery fee (KWD)", "رسوم التوصيل (د.ك)")}</label><input id="z-fee" required type="number" min={0} max={1000} step="0.001" dir="ltr" className="input" value={draft.fee} onChange={(e) => setDraft({ ...draft, fee: e.target.value })} /></div>
            <div><label className="label" htmlFor="z-min">{tr("Minimum order (KWD, optional)", "الحد الأدنى للطلب (د.ك، اختياري)")}</label><input id="z-min" type="number" min={0} step="0.001" dir="ltr" className="input" value={draft.min_order} onChange={(e) => setDraft({ ...draft, min_order: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />{tr("Active", "مفعّلة")}</label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>{tr("Cancel", "إلغاء")}</Button>
              <Button type="submit" disabled={busy}>{busy ? tr("Saving…", "جارٍ الحفظ…") : tr("Save area", "حفظ المنطقة")}</Button>
            </div>
          </form>
        </Card>
      )}
      {zones === null ? <Skeleton className="h-24" /> : zones.length === 0 ? (
        <EmptyState icon={<MapPin className="h-6 w-6" />} title={tr("No delivery areas yet", "ما فيه مناطق توصيل بعد")} body={tr("Delivery currently has no fee and no area limits.", "التوصيل حالياً بدون رسوم وبدون تحديد مناطق.")} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {zones.map((z) => (
            <Card key={z.id} className="min-w-0 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold" dir="auto">{z.name}</p>
                  {z.areas.length > 0 && <p className="mt-0.5 text-xs text-muted" dir="auto">{z.areas.join("، ")}</p>}
                </div>
                <Badge tone={z.is_active ? "green" : "gray"}>{z.is_active ? tr("Active", "مفعّلة") : tr("Paused", "متوقفة")}</Badge>
              </div>
              <p className="mt-2 text-sm"><span className="text-muted">{tr("Fee", "الرسوم")}: </span><span dir="ltr" className="tabular-nums">{money(z.fee)}</span>
                {Number(z.min_order) > 0 && <><span className="text-muted"> · {tr("Min", "الحد الأدنى")}: </span><span dir="ltr" className="tabular-nums">{money(z.min_order)}</span></>}</p>
              {canEdit && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setDraft({ id: z.id, name: z.name, areas: z.areas.join(", "), fee: String(z.fee), min_order: String(z.min_order || ""), is_active: z.is_active })}>{tr("Edit", "تعديل")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(z)}>{z.is_active ? tr("Pause", "إيقاف") : tr("Enable", "تفعيل")}</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
