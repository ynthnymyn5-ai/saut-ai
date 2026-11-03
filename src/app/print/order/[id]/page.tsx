import { notFound } from "next/navigation";
import { PrintActions } from "@/components/dashboard/PrintActions";
import { requirePageSession } from "@/lib/auth";
import { formatAddress, type DeliveryAddress } from "@/lib/orders";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Print order", robots: { index: false } };

const FUL: Record<string, string> = { pickup: "استلام", delivery: "توصيل", dine_in: "داخل المحل" };

/** Kitchen ticket and customer receipt for one order, sized for 80 mm receipt printers (also fine on A4). */
export default async function PrintOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ part?: string }> }) {
  const s = await requirePageSession();
  const { id } = await params;
  const part = (await searchParams).part ?? "both";
  if (!/^[0-9a-f-]{36}$/.test(id) || s.demo) notFound();
  const sb = (await supabaseServer())!;
  const { data: o } = await sb.from("orders").select("id, order_no, status, fulfillment, subtotal, delivery_fee, total, currency, notes, created_at, delivery_address, customers(full_name, phone), delivery_zones(name)")
    .eq("id", id).eq("organization_id", s.org.id).maybeSingle();
  if (!o) notFound();
  const [{ data: items }, { data: org }] = await Promise.all([
    sb.from("order_items").select("name, unit_price, quantity, line_total").eq("order_id", id).eq("organization_id", s.org.id),
    sb.from("organizations").select("name, address, contact_phone, timezone").eq("id", s.org.id).single(),
  ]);
  const c = o.customers as unknown as { full_name: string | null; phone: string | null } | null;
  const addr = o.delivery_address as DeliveryAddress | null;
  const zone = (o.delivery_zones as unknown as { name: string } | null)?.name;
  const when = new Intl.DateTimeFormat("ar-KW", { dateStyle: "short", timeStyle: "short", timeZone: (org?.timezone as string) || "Asia/Kuwait" }).format(new Date(o.created_at as string));
  const money = (v: unknown) => `${Number(v).toFixed(3)} ${o.currency}`;
  const showKitchen = part !== "receipt", showReceipt = part !== "kitchen";

  return (
    <div dir="rtl" className="print-root">
      <style>{`
        .print-root{background:#fff;color:#000;min-height:100vh;font-family:Tahoma,Arial,sans-serif;padding:16px}
        .ticket{width:76mm;max-width:100%;margin:0 auto 24px;font-size:13px;line-height:1.45}
        .ticket h1{font-size:18px;margin:0 0 4px;text-align:center}
        .ticket .big{font-size:22px;font-weight:700;text-align:center;margin:6px 0}
        .ticket .row{display:flex;justify-content:space-between;gap:8px}
        .ticket hr{border:0;border-top:1px dashed #000;margin:8px 0}
        .ticket .item{font-size:16px;font-weight:700}
        .ltr{direction:ltr;unicode-bidi:embed}
        @media print{.no-print{display:none!important}.print-root{padding:0}.ticket{margin:0 auto}.break{page-break-after:always}@page{margin:4mm}}
      `}</style>
      <PrintActions orderId={o.id as string} />
      {showKitchen && (
        <section className={`ticket ${showReceipt ? "break" : ""}`} aria-label="Kitchen ticket">
          <h1>تذكرة المطبخ</h1>
          <p className="big ltr">#{o.order_no}</p>
          <p style={{ textAlign: "center" }}>{FUL[o.fulfillment as string] ?? o.fulfillment}{zone ? ` · ${zone}` : ""} · {when}</p>
          <hr />
          {(items ?? []).map((i, k) => <p key={k} className="item">{i.quantity} × {i.name}</p>)}
          {o.notes && (<><hr /><p><b>ملاحظات:</b> {o.notes as string}</p></>)}
        </section>
      )}
      {showReceipt && (
        <section className="ticket" aria-label="Receipt">
          <h1>{org?.name as string}</h1>
          {org?.address && <p style={{ textAlign: "center" }}>{org.address as string}</p>}
          {org?.contact_phone && <p style={{ textAlign: "center" }} className="ltr">{org.contact_phone as string}</p>}
          <hr />
          <div className="row"><span>طلب</span><span className="ltr">#{o.order_no}</span></div>
          <div className="row"><span>التاريخ</span><span>{when}</span></div>
          <div className="row"><span>النوع</span><span>{FUL[o.fulfillment as string] ?? o.fulfillment}</span></div>
          {c?.full_name && <div className="row"><span>العميل</span><span>{c.full_name}</span></div>}
          {c?.phone && <div className="row"><span>الهاتف</span><span className="ltr">{c.phone}</span></div>}
          {addr && <p style={{ marginTop: 4 }}><b>العنوان:</b> {formatAddress(addr, true)}{addr.notes ? ` — ${addr.notes}` : ""}</p>}
          <hr />
          {(items ?? []).map((i, k) => (
            <div key={k} className="row"><span>{i.quantity} × {i.name}</span><span className="ltr">{money(i.line_total)}</span></div>
          ))}
          <hr />
          <div className="row"><span>المجموع الفرعي</span><span className="ltr">{money(o.subtotal)}</span></div>
          {Number(o.delivery_fee) > 0 && <div className="row"><span>رسوم التوصيل</span><span className="ltr">{money(o.delivery_fee)}</span></div>}
          <div className="row" style={{ fontWeight: 700, fontSize: 16 }}><span>الإجمالي</span><span className="ltr">{money(o.total)}</span></div>
          <hr />
          <p style={{ textAlign: "center" }}>شكراً لكم 🌟</p>
        </section>
      )}
    </div>
  );
}
