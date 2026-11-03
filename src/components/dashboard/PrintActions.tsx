"use client";
import Link from "next/link";
import { useEffect } from "react";

/** Print buttons (hidden on paper). Opens the print dialog automatically once the page has drawn. */
export function PrintActions({ orderId }: { orderId: string }) {
  useEffect(() => { const t = setTimeout(() => window.print(), 400); return () => clearTimeout(t); }, []);
  const btn = "rounded-lg border border-black/20 px-3 py-1.5 text-sm";
  return (
    <div className="no-print mx-auto mb-4 flex max-w-md flex-wrap justify-center gap-2" dir="rtl">
      <button type="button" className={btn} onClick={() => window.print()}>🖨️ طباعة</button>
      <Link className={btn} href={`/print/order/${orderId}?part=kitchen`}>المطبخ فقط</Link>
      <Link className={btn} href={`/print/order/${orderId}?part=receipt`}>الفاتورة فقط</Link>
      <Link className={btn} href={`/print/order/${orderId}`}>الاثنين</Link>
      <Link className={btn} href="/dashboard/orders">رجوع للطلبات</Link>
    </div>
  );
}
