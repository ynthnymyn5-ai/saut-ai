"use client";
import { Bike, CheckCircle2, MapPin, Navigation, Phone } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { ErrorNote, useApi, useMutate, useTr } from "@/components/os/shared";
import { useI18n } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/payments/money";

type Row = { id: string; order_no: number; status: string; total: number; currency: string; notes: string | null; zone: string | null; addressText: string; addressNotes: string | null; maps: string | null; customer: { name: string | null; phone: string | null } | null; items: { name: string; quantity: number }[] };
const LABEL: Record<string, string> = { confirmed: "مؤكد", preparing: "قيد التجهيز", ready: "جاهز للاستلام من المحل", out_for_delivery: "في الطريق", delivered: "تم التسليم" };

/** A driver's phone screen: their assigned deliveries, map and call buttons, and one-tap status updates. */
export function DriverView({ demo }: { demo: boolean }) {
  const tr = useTr();
  const { locale } = useI18n();
  const data = useApi<{ active: Row[]; done: Row[]; demo?: boolean }>("/api/driver/orders", { pollMs: 20_000 });
  const mutate = useMutate();
  const money = (v: number, c: string) => formatMoney(Number(v), c, locale);
  async function move(id: string, status: string, msg: string) { if (await mutate(`/api/orders/${id}`, "PATCH", { status }, msg)) data.reload(); }

  return (
    <div>
      <PageHeader title={tr("My deliveries", "توصيلاتي")} subtitle={tr("Orders assigned to you. Updates every 20 seconds.", "الطلبات المسندة لك. تتحدّث كل ٢٠ ثانية.")} />
      <ErrorNote error={data.error} />
      {demo || data.data?.demo ? <p className="text-sm text-muted">{tr("Demo mode: no live orders.", "وضع تجريبي: ما فيه طلبات فعلية.")}</p>
        : !data.data ? <Skeleton className="h-40" />
        : data.data.active.length === 0 ? <EmptyState icon={<Bike className="h-6 w-6" />} title={tr("No deliveries assigned to you", "ما فيه توصيلات مسندة لك")} body={tr("When staff assign you an order it appears here.", "لما يسند لك الموظف طلب، بيطلع هني.")} />
        : (
          <div className="space-y-3">
            {data.data.active.map((o) => (
              <Card key={o.id} className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-lg font-semibold" dir="ltr">#{o.order_no}</p>
                  <Badge tone={o.status === "out_for_delivery" ? "blue" : "violet"}>{LABEL[o.status] ?? o.status}</Badge>
                </div>
                {o.customer?.name && <p className="text-sm" dir="auto">{o.customer.name}</p>}
                <p className="flex items-start gap-1.5 text-sm" dir="auto"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-violet-soft" />{o.addressText || tr("No address", "بدون عنوان")}{o.zone ? ` · ${o.zone}` : ""}</p>
                {o.addressNotes && <p className="text-xs text-muted" dir="auto">{o.addressNotes}</p>}
                <p className="text-xs text-muted" dir="auto">{o.items.map((i) => `${i.quantity}× ${i.name}`).join("، ")}</p>
                {o.notes && <p className="text-xs text-amber-200" dir="auto">{o.notes}</p>}
                <p className="text-sm">{tr("Collect", "المبلغ")}: <span dir="ltr" className="font-semibold tabular-nums">{money(o.total, o.currency)}</span></p>
                <div className="grid grid-cols-2 gap-2">
                  {o.maps && <a href={o.maps} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line px-3 py-2.5 text-sm"><Navigation className="h-4 w-4" />{tr("Map", "الخريطة")}</a>}
                  {o.customer?.phone && <a href={`tel:${o.customer.phone}`} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line px-3 py-2.5 text-sm"><Phone className="h-4 w-4" />{tr("Call", "اتصال")}</a>}
                </div>
                {o.status === "ready" && <Button className="w-full" onClick={() => move(o.id, "out_for_delivery", tr("Marked on the way", "صار في الطريق"))}><Bike className="h-4 w-4" />{tr("Picked up — on my way", "استلمته — أنا في الطريق")}</Button>}
                {o.status === "out_for_delivery" && <Button className="w-full" onClick={() => move(o.id, "delivered", tr("Delivered", "تم التسليم"))}><CheckCircle2 className="h-4 w-4" />{tr("Delivered", "تم التسليم")}</Button>}
                {["confirmed", "preparing"].includes(o.status) && <p className="text-center text-xs text-muted">{tr("Waiting for the kitchen to mark it ready.", "بانتظار المطبخ يجهّز الطلب.")}</p>}
              </Card>
            ))}
          </div>
        )}
      {!!data.data?.done.length && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold text-muted">{tr("Delivered today", "تم توصيلها اليوم")} ({data.data.done.length})</p>
          <ul className="space-y-1 text-sm text-muted">{data.data.done.map((o) => <li key={o.id} dir="auto">#{o.order_no} · {o.addressText}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
