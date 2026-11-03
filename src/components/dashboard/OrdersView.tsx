"use client";
import { Bike, Camera, Link2, MapPin, Package, Plus, Printer, Send, ShoppingBag, Trash2 } from "lucide-react";
import { SalesAnalytics } from "@/components/dashboard/SalesAnalytics";
import { waMeUrl } from "@/lib/links";
import { DeliveryZones } from "@/components/dashboard/DeliveryZones";
import { MenuImport } from "@/components/dashboard/MenuImport";
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { ErrorNote, useApi, useMutate, useTr } from "@/components/os/shared";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/payments/money";
import { formatAddress, missingAddressParts, nextStatuses, ORDER_STATUSES, type DeliveryAddress, type OrderStatus } from "@/lib/orders";
import { cn, formatDate } from "@/lib/utils";

type Order = { id: string; order_no: number; status: OrderStatus; fulfillment: string; total: number; deliveryFee?: number; currency: string; notes: string | null; created_at: string; customer: { id: string; name: string | null; phone: string | null } | null; takenBy: string | null; address?: DeliveryAddress | null; zone?: string | null; driverUser?: string | null };
type Zone = { id: string; name: string; areas: string[]; fee: number; min_order: number; is_active: boolean };
type Member = { user_id: string; full_name: string | null; email: string };
type Product = { id: string; name: string; description: string | null; sku: string | null; price: number; currency: string; is_active: boolean };
type Detail = { order: Order & { subtotal: number; trackingUrl?: string | null }; items: { id: string; name: string; unit_price: number; quantity: number; line_total: number }[]; events: { from_status: string | null; to_status: string; created_at: string }[] };

const STATUS_AR: Record<string, string> = { pending: "بانتظار التأكيد", confirmed: "مؤكد", preparing: "قيد التجهيز", ready: "جاهز", out_for_delivery: "في الطريق", delivered: "تم التسليم", canceled: "ملغي" };
const FUL_AR: Record<string, string> = { pickup: "استلام", delivery: "توصيل", dine_in: "داخل المحل" };
const tone = (s: string) => (s === "canceled" ? "red" : s === "delivered" ? "green" : s === "pending" ? "amber" : s === "out_for_delivery" ? "blue" : "violet") as "red" | "green" | "amber" | "violet" | "blue";

export function OrdersView({ demo, canEdit, canManageProducts }: { demo: boolean; canEdit: boolean; canManageProducts: boolean }) {
  const tr = useTr();
  const { locale } = useI18n();
  const mutate = useMutate();
  const toastApi = useToast();
  const toast = (title: string) => toastApi({ kind: "success", title });
  const [tab, setTab] = useState<"orders" | "products" | "zones" | "sales">("orders");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const orders = useApi<{ orders: Order[]; demo?: boolean }>(`/api/orders?${new URLSearchParams({ ...(filter !== "all" ? { status: filter } : {}), ...(q ? { q } : {}) })}`);
  const products = useApi<{ products: Product[]; demo?: boolean }>("/api/products");
  const zones = useApi<{ zones: Zone[] }>("/api/delivery-zones");
  const members = useApi<{ members: Member[]; me: string }>("/api/members");
  const activeZones = (zones.data?.zones ?? []).filter((z) => z.is_active);
  const memberName = (uid?: string | null) => { const m = members.data?.members.find((x) => x.user_id === uid); return m ? m.full_name ?? m.email : null; };
  const [open, setOpen] = useState<string | null>(null);
  const detail = useApi<Detail>(open ? `/api/orders/${open}` : null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [newOrder, setNewOrder] = useState<null | { customer_name: string; phone: string; fulfillment: string; notes: string; lines: { product_id: string; quantity: number }[]; zone_id: string; address: DeliveryAddress }>(null);
  const [prod, setProd] = useState<null | { id?: string; name: string; description: string; price: string; is_active: boolean }>(null);

  const label = (s: string) => (locale === "ar" ? STATUS_AR[s] ?? s : s.replace("_", " "));
  const money = (v: number, c: string) => formatMoney(Number(v), c, locale);
  const active = useMemo(() => (products.data?.products ?? []).filter((p) => p.is_active), [products.data]);
  const estimate = useMemo(() => (newOrder?.lines ?? []).reduce((sum, l) => sum + (active.find((p) => p.id === l.product_id)?.price ?? 0) * l.quantity, 0), [newOrder, active]);
  const isDemo = demo || orders.data?.demo;
  const fee = newOrder?.fulfillment === "delivery" ? Number(activeZones.find((z) => z.id === newOrder.zone_id)?.fee ?? 0) : 0;
  const zoneMin = newOrder?.fulfillment === "delivery" ? Number(activeZones.find((z) => z.id === newOrder.zone_id)?.min_order ?? 0) : 0;
  const addrMissing = newOrder?.fulfillment === "delivery" ? missingAddressParts(newOrder.address) : [];
  const setAddr = (k: keyof DeliveryAddress, v: string) => newOrder && setNewOrder({ ...newOrder, address: { ...newOrder.address, [k]: v } });
  async function assign(id: string, driver: string) {
    if (await mutate(`/api/orders/${id}`, "PATCH", { driver_user: driver || null }, tr("Driver assigned", "تم تعيين السائق"))) orders.reload();
  }

  async function move(id: string, to: string) {
    if (to === "canceled" && !window.confirm(tr("Cancel this order? This can't be undone.", "إلغاء هذا الطلب؟ لا يمكن التراجع."))) return;
    const res = await mutate(`/api/orders/${id}`, "PATCH", { status: to }, tr("Order updated", "تم تحديث الطلب"));
    if (res) { if (res.customerNotified === "whatsapp") toast(tr("Customer notified on WhatsApp", "تم إبلاغ العميل على واتساب")); orders.reload(); if (open === id) detail.reload(); }
  }

  return (
    <>
      <PageHeader title={tr("Orders", "الطلبات")} subtitle={tr("Orders taken by your team and AI employees. Prices always come from your product list.", "الطلبات التي يأخذها فريقك وموظفوك الأذكياء. الأسعار تُحسب دائماً من قائمة منتجاتك.")} demo={demo}
        actions={tab === "orders" ? canEdit && active.length > 0 && <Button onClick={() => setNewOrder({ customer_name: "", phone: "", fulfillment: "pickup", notes: "", lines: [{ product_id: active[0].id, quantity: 1 }], zone_id: "", address: { area: "", block: "" } })}><Plus className="h-4 w-4" />{tr("New order", "طلب جديد")}</Button>
          : tab === "zones" || tab === "sales" ? null : canManageProducts && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setImporting(true)}><Camera className="h-4 w-4" />{tr("Import from menu photo", "استيراد من صورة المنيو")}</Button><Button onClick={() => setProd({ name: "", description: "", price: "", is_active: true })}><Plus className="h-4 w-4" />{tr("Add product", "إضافة منتج")}</Button></div>} />
      {importing && <MenuImport onClose={() => setImporting(false)} onAdded={() => { setImporting(false); products.reload(); }} />}

      <div className="mb-4 flex gap-2 overflow-x-auto border-b border-line">
        {(["orders", "products", "zones", ...(canManageProducts ? ["sales" as const] : [])] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm", tab === t ? "border-violet text-white" : "border-transparent text-muted")}>
            {t === "orders" ? tr("Orders", "الطلبات") : t === "products" ? tr("Products & menu", "المنتجات والقائمة") : t === "zones" ? tr("Delivery areas", "مناطق التوصيل") : tr("Sales analytics", "تحليل المبيعات")}
          </button>
        ))}
      </div>

      {tab === "orders" ? (
        <>
          <ErrorNote error={orders.error} />
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            {["all", ...ORDER_STATUSES].map((st) => <button key={st} onClick={() => setFilter(st)} className={cn("shrink-0 rounded-xl border px-3 py-2 text-xs", filter === st ? "border-violet bg-violet/15" : "border-line text-muted")}>{st === "all" ? tr("All", "الكل") : label(st)}</button>)}
            <input aria-label={tr("Order number", "رقم الطلب")} inputMode="numeric" dir="ltr" className="input ms-auto w-36 py-1.5 text-xs" placeholder={tr("Order #", "رقم الطلب")} value={q} onChange={(e) => setQ(e.target.value.replace(/\D/g, "").slice(0, 9))} />
          </div>
          {orders.loading ? <Skeleton className="h-64" /> : isDemo ? (
            <EmptyState icon={<ShoppingBag className="h-6 w-6" />} title={tr("Orders are stored in your database", "الطلبات تُحفظ في قاعدة بياناتك")} body={tr("Demo mode has no order data.", "لا توجد طلبات في الوضع التجريبي.")} />
          ) : (orders.data?.orders ?? []).length === 0 ? (
            <EmptyState icon={<ShoppingBag className="h-6 w-6" />} title={tr("No orders yet", "لا توجد طلبات بعد")}
              body={active.length === 0 ? tr("Add your products first — the AI employee only takes orders for items on your list.", "أضف منتجاتك أولاً — الموظف الذكي يأخذ الطلبات فقط للأصناف الموجودة في قائمتك.") : tr("Orders from WhatsApp, calls or your team appear here.", "تظهر هنا الطلبات من واتساب والمكالمات وفريقك.")}
              action={active.length === 0 && canManageProducts ? <Button onClick={() => setTab("products")}>{tr("Add products", "إضافة منتجات")}</Button> : undefined} />
          ) : (
            <div className="space-y-2">
              {orders.data!.orders.map((o) => (
                <Card key={o.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <button className="min-w-0 flex-1 text-start" onClick={() => setOpen(open === o.id ? null : o.id)}>
                      <p className="font-medium"><span dir="ltr" className="tabular-nums">#{o.order_no}</span> · {o.customer?.name ?? tr("Walk-in", "بدون اسم")} <span className="text-xs text-muted" dir="ltr">{o.customer?.phone}</span></p>
                      <p className="text-xs text-muted">{formatDate(o.created_at, locale)} · {locale === "ar" ? FUL_AR[o.fulfillment] : o.fulfillment.replace("_", " ")}{o.takenBy ? ` · ${tr("taken by", "أخذه")} ${o.takenBy}` : ""}</p>
                      {o.fulfillment === "delivery" && o.address && <p className="mt-0.5 flex items-start gap-1 text-xs text-sky-200" dir="auto"><MapPin className="mt-0.5 h-3 w-3 shrink-0" />{formatAddress(o.address, locale === "ar")}{o.zone ? ` · ${o.zone}` : ""}</p>}
                      {o.fulfillment === "delivery" && o.driverUser && <p className="mt-0.5 flex items-center gap-1 text-xs text-muted"><Bike className="h-3 w-3" />{memberName(o.driverUser) ?? tr("Driver", "السائق")}</p>}
                    </button>
                    <span className="font-display font-semibold tabular-nums" dir="ltr">{money(o.total, o.currency)}</span>
                    <Badge tone={tone(o.status)}>{label(o.status)}</Badge>
                    {canEdit && nextStatuses(o.status, o.fulfillment).length > 0 && (
                      <select aria-label={tr("Move to", "نقل إلى")} className="input w-auto py-1.5 text-xs" value="" onChange={(e) => e.target.value && move(o.id, e.target.value)}>
                        <option value="">{tr("Move to…", "نقل إلى…")}</option>
                        {nextStatuses(o.status, o.fulfillment).map((s) => <option key={s} value={s}>{label(s)}</option>)}
                      </select>
                    )}
                    {canEdit && o.fulfillment === "delivery" && !["delivered", "canceled"].includes(o.status) && (
                      <select aria-label={tr("Driver", "السائق")} className="input w-auto py-1.5 text-xs" value={o.driverUser ?? ""} onChange={(e) => assign(o.id, e.target.value)}>
                        <option value="">{tr("No driver", "بدون سائق")}</option>
                        {(members.data?.members ?? []).map((m) => <option key={m.user_id} value={m.user_id}>🛵 {m.full_name ?? m.email}</option>)}
                      </select>
                    )}
                  </div>
                  {open === o.id && (
                    <div className="mt-3 border-t border-line pt-3 text-sm">
                      {detail.loading || !detail.data ? <Skeleton className="h-16" /> : (
                        <>
                          <ul className="space-y-1">
                            {detail.data.items.map((i) => <li key={i.id} className="flex justify-between gap-2"><span>{i.quantity} × {i.name}</span><span dir="ltr" className="tabular-nums text-muted">{money(i.line_total, o.currency)}</span></li>)}
                          </ul>
                          {Number(o.deliveryFee ?? 0) > 0 && <p className="flex justify-between gap-2 text-muted"><span>{tr("Delivery fee", "رسوم التوصيل")}</span><span dir="ltr" className="tabular-nums">{money(Number(o.deliveryFee), o.currency)}</span></p>}
                          {o.address?.notes && <p className="mt-1 text-xs text-muted" dir="auto">{tr("Address notes", "ملاحظات العنوان")}: {o.address.notes}</p>}
                          {o.notes && <p className="mt-2 text-xs text-muted">{tr("Notes", "ملاحظات")}: {o.notes}</p>}
                          <p className="mt-2 text-xs text-muted">{detail.data.events.map((e) => `${label(e.to_status)} ${formatDate(e.created_at, locale, { dateStyle: undefined, timeStyle: "short" })}`).join(" → ")}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <a href={`/print/order/${o.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs hover:bg-white/5"><Printer className="h-3.5 w-3.5" />{tr("Print", "طباعة")}</a>
                            {detail.data.order.trackingUrl && <>
                              <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(detail.data!.order.trackingUrl!); toast(tr("Tracking link copied", "تم نسخ رابط التتبع")); } catch { /* clipboard blocked */ } }} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs hover:bg-white/5"><Link2 className="h-3.5 w-3.5" />{tr("Copy tracking link", "نسخ رابط التتبع")}</button>
                              {waMeUrl(o.customer?.phone, `${tr("Follow your order", "تابع طلبك")} #${o.order_no}: ${detail.data.order.trackingUrl}`) && <a href={waMeUrl(o.customer?.phone, `${tr("Follow your order", "تابع طلبك")} #${o.order_no}: ${detail.data.order.trackingUrl}`)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs hover:bg-white/5"><Send className="h-3.5 w-3.5" />{tr("Send link on WhatsApp", "أرسل الرابط بالواتساب")}</a>}
                            </>}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      ) : tab === "sales" ? (
        <SalesAnalytics />
      ) : tab === "zones" ? (
        <DeliveryZones canEdit={canManageProducts} zones={zones.data?.zones ?? null} error={zones.error} onChange={zones.reload} />
      ) : (
        <>
          <ErrorNote error={products.error} />
          {products.loading ? <Skeleton className="h-64" /> : (products.data?.products ?? []).length === 0 ? (
            <EmptyState icon={<Package className="h-6 w-6" />} title={tr("No products yet", "لا توجد منتجات بعد")} body={tr("Add what you sell with real prices. Your AI employee quotes only these prices and never invents one.", "أضف ما تبيعه بأسعاره الحقيقية. موظفك الذكي يذكر هذه الأسعار فقط ولا يخترع سعراً.")} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {products.data!.products.map((p) => (
                <Card key={p.id} className={cn("flex items-center gap-3 p-4", !p.is_active && "opacity-60")}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium" dir="auto">{p.name}</p>
                    {p.description && <p className="truncate text-xs text-muted" dir="auto">{p.description}</p>}
                  </div>
                  <span className="tabular-nums" dir="ltr">{money(p.price, p.currency)}</span>
                  {!p.is_active && <Badge tone="gray">{tr("Hidden", "مخفي")}</Badge>}
                  {canManageProducts && <Button size="sm" variant="ghost" onClick={() => setProd({ id: p.id, name: p.name, description: p.description ?? "", price: String(p.price), is_active: p.is_active })}>{tr("Edit", "تعديل")}</Button>}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {newOrder && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onClick={() => setNewOrder(null)}>
          <form onClick={(e) => e.stopPropagation()} className="glass my-8 w-full max-w-md space-y-3 bg-ink-2 p-6" onSubmit={async (e) => {
            e.preventDefault(); if (busy) return; setBusy(true);
            try {
              const delivery = newOrder.fulfillment === "delivery";
              const clean = Object.fromEntries(Object.entries(newOrder.address).filter(([, v]) => typeof v === "string" && v.trim()));
              const r = await mutate("/api/orders", "POST", { items: newOrder.lines, customer_name: newOrder.customer_name || undefined, phone: newOrder.phone || undefined, fulfillment: newOrder.fulfillment, notes: newOrder.notes || undefined,
                ...(delivery ? { address: clean, zone_id: newOrder.zone_id || undefined } : {}) }, tr("Order created", "تم إنشاء الطلب"));
              if (r) { setNewOrder(null); orders.reload(); }
            } finally { setBusy(false); }
          }}>
            <h3 className="font-display text-lg font-semibold">{tr("New order", "طلب جديد")}</h3>
            {newOrder.lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <select aria-label={tr("Product", "المنتج")} className="input flex-1" value={l.product_id} onChange={(e) => setNewOrder({ ...newOrder, lines: newOrder.lines.map((x, j) => (j === i ? { ...x, product_id: e.target.value } : x)) })}>
                  {active.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.price, p.currency)}</option>)}
                </select>
                <input aria-label={tr("Quantity", "الكمية")} type="number" min={1} max={999} className="input w-20" value={l.quantity} onChange={(e) => setNewOrder({ ...newOrder, lines: newOrder.lines.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Math.min(999, Number(e.target.value) || 1)) } : x)) })} />
                {newOrder.lines.length > 1 && <button type="button" aria-label={tr("Remove", "حذف")} className="text-muted hover:text-white" onClick={() => setNewOrder({ ...newOrder, lines: newOrder.lines.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
            {newOrder.lines.length < 50 && <Button type="button" size="sm" variant="ghost" onClick={() => setNewOrder({ ...newOrder, lines: [...newOrder.lines, { product_id: active[0].id, quantity: 1 }] })}><Plus className="h-4 w-4" />{tr("Add item", "إضافة صنف")}</Button>}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label" htmlFor="or-name">{tr("Customer name", "اسم العميل")}</label><input id="or-name" maxLength={120} dir="auto" className="input" value={newOrder.customer_name} onChange={(e) => setNewOrder({ ...newOrder, customer_name: e.target.value })} /></div>
              <div><label className="label" htmlFor="or-phone">{tr("Phone", "الهاتف")}</label><input id="or-phone" dir="ltr" pattern="\+?[0-9 ]{6,20}" className="input" value={newOrder.phone} onChange={(e) => setNewOrder({ ...newOrder, phone: e.target.value })} placeholder="+965 ..." /></div>
            </div>
            <div><label className="label" htmlFor="or-ful">{tr("Fulfillment", "طريقة الاستلام")}</label>
              <select id="or-ful" className="input" value={newOrder.fulfillment} onChange={(e) => setNewOrder({ ...newOrder, fulfillment: e.target.value })}>{["pickup", "delivery", "dine_in"].map((f) => <option key={f} value={f}>{locale === "ar" ? FUL_AR[f] : f.replace("_", " ")}</option>)}</select></div>
            {newOrder.fulfillment === "delivery" && (
              <div className="space-y-3 rounded-xl border border-line p-3">
                {activeZones.length > 0 && (
                  <div><label className="label" htmlFor="or-zone">{tr("Delivery area", "منطقة التوصيل")}</label>
                    <select id="or-zone" required className="input" value={newOrder.zone_id} onChange={(e) => { const z = activeZones.find((x) => x.id === e.target.value); setNewOrder({ ...newOrder, zone_id: e.target.value, address: { ...newOrder.address, area: newOrder.address.area || (z?.name ?? "") } }); }}>
                      <option value="">{tr("Choose…", "اختر…")}</option>
                      {activeZones.map((z) => <option key={z.id} value={z.id}>{z.name} — {money(z.fee, "KWD")}</option>)}
                    </select></div>
                )}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {([["area", tr("Area *", "المنطقة *")], ["block", tr("Block *", "القطعة *")], ["street", tr("Street", "الشارع")], ["avenue", tr("Avenue", "الجادة")], ["house", tr("House *", "المنزل *")], ["floor", tr("Floor", "الدور")], ["apartment", tr("Apt", "الشقة")]] as [keyof DeliveryAddress, string][]).map(([k, lbl]) => (
                    <div key={k}><label className="label text-xs" htmlFor={`addr-${k}`}>{lbl}</label><input id={`addr-${k}`} dir="auto" maxLength={k === "street" ? 120 : 80} className="input py-1.5" value={newOrder.address[k] ?? ""} onChange={(e) => setAddr(k, e.target.value)} /></div>
                  ))}
                </div>
                <div><label className="label text-xs" htmlFor="addr-notes">{tr("Directions for the driver", "إرشادات للسائق")}</label><input id="addr-notes" dir="auto" maxLength={300} className="input py-1.5" value={newOrder.address.notes ?? ""} onChange={(e) => setAddr("notes", e.target.value)} /></div>
                {addrMissing.length > 0 && <p className="text-xs text-amber-200">{tr("Required: area, block, and house number or street.", "مطلوب: المنطقة والقطعة ورقم المنزل أو الشارع.")}</p>}
                {zoneMin > 0 && estimate < zoneMin && <p className="text-xs text-amber-200">{tr(`Minimum order for this area: ${money(zoneMin, "KWD")}`, `الحد الأدنى للطلب لهذه المنطقة: ${money(zoneMin, "KWD")}`)}</p>}
              </div>
            )}
            <div><label className="label" htmlFor="or-notes">{tr("Notes", "ملاحظات")}</label><input id="or-notes" dir="auto" maxLength={1000} className="input" value={newOrder.notes} onChange={(e) => setNewOrder({ ...newOrder, notes: e.target.value })} /></div>
            <p className="text-sm text-muted">{tr("Estimated total", "المجموع التقديري")}: <span dir="ltr" className="font-semibold text-white tabular-nums">{money(estimate + fee, active[0]?.currency ?? "KWD")}</span>{fee > 0 && <span className="text-xs"> ({tr("incl. delivery", "شامل التوصيل")} {money(fee, "KWD")})</span>} <span className="text-xs">({tr("final total is calculated by the server", "المجموع النهائي يحسبه الخادم")})</span></p>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => setNewOrder(null)}>{tr("Cancel", "إلغاء")}</Button><Button type="submit" disabled={busy || addrMissing.length > 0 || (newOrder.fulfillment === "delivery" && activeZones.length > 0 && !newOrder.zone_id)}>{busy ? tr("Saving…", "جارٍ الحفظ…") : tr("Create order", "إنشاء الطلب")}</Button></div>
          </form>
        </div>
      )}

      {prod && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onClick={() => setProd(null)}>
          <form onClick={(e) => e.stopPropagation()} className="glass my-8 w-full max-w-md space-y-3 bg-ink-2 p-6" onSubmit={async (e) => {
            e.preventDefault(); if (busy) return; setBusy(true);
            try {
              const body = { name: prod.name, description: prod.description || null, price: Math.round(Number(prod.price) * 1000) / 1000, is_active: prod.is_active };
              const r = prod.id ? await mutate(`/api/products/${prod.id}`, "PATCH", body, tr("Saved", "تم الحفظ")) : await mutate("/api/products", "POST", body, tr("Product added", "تمت إضافة المنتج"));
              if (r) { setProd(null); products.reload(); }
            } finally { setBusy(false); }
          }}>
            <h3 className="font-display text-lg font-semibold">{prod.id ? tr("Edit product", "تعديل المنتج") : tr("Add product", "إضافة منتج")}</h3>
            <div><label className="label" htmlFor="pr-name">{tr("Name", "الاسم")}</label><input id="pr-name" required maxLength={160} dir="auto" className="input" value={prod.name} onChange={(e) => setProd({ ...prod, name: e.target.value })} /></div>
            <div><label className="label" htmlFor="pr-desc">{tr("Description", "الوصف")}</label><input id="pr-desc" maxLength={1000} dir="auto" className="input" value={prod.description} onChange={(e) => setProd({ ...prod, description: e.target.value })} /></div>
            <div><label className="label" htmlFor="pr-price">{tr("Price (KWD)", "السعر (د.ك)")}</label><input id="pr-price" required type="number" min={0} max={100000} step="0.001" dir="ltr" className="input" value={prod.price} onChange={(e) => setProd({ ...prod, price: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-violet" checked={prod.is_active} onChange={(e) => setProd({ ...prod, is_active: e.target.checked })} />{tr("Available to order (the AI can offer it)", "متاح للطلب (يمكن للموظف الذكي عرضه)")}</label>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => setProd(null)}>{tr("Cancel", "إلغاء")}</Button><Button type="submit" disabled={busy}>{tr("Save", "حفظ")}</Button></div>
          </form>
        </div>
      )}
    </>
  );
}
