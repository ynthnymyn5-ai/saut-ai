"use client";
import { motion } from "framer-motion";
import { Bot, Plus } from "lucide-react";
import Link from "next/link";
import { SoMascot } from "@/components/brand/SoMascot";
import { Badge, ButtonLink, EmptyState, PageHeader, statusTone } from "@/components/ui/primitives";
import type { DemoEmployee } from "@/lib/demo-data";
import { useI18n } from "@/lib/i18n/client";
import { DIALECT_LABELS } from "./labels";

export function EmployeeList({ employees, demo, limit }: { employees: DemoEmployee[]; demo: boolean; limit: number }) {
  const { t, locale } = useI18n();
  return (
    <>
      <PageHeader
        title={t.dash.nav.employees}
        subtitle={locale === "ar" ? `${employees.length} من ${limit} حسب خطتك` : `${employees.length} of ${limit} on your plan`}
        demo={demo}
        actions={<ButtonLink href="/dashboard/employees/new"><Plus className="h-4 w-4" />{t.dash.create}</ButtonLink>}
      />
      {employees.length === 0 ? (
        <EmptyState icon={<Bot className="h-6 w-6" />} title={locale === "ar" ? "ما عندك موظفين أذكياء بعد" : "No AI employees yet"} body={locale === "ar" ? "أنشئ أول موظف خلال دقائق." : "Create your first one in a few minutes."} action={<ButtonLink href="/dashboard/employees/new">{t.dash.create}</ButtonLink>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {employees.map((e, i) => (
            <motion.div key={e.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <Link href={`/dashboard/employees/${e.id}`} className="glass group flex flex-col items-center p-6 text-center transition hover:-translate-y-1 hover:border-violet/40">
                <SoMascot size={120} hue={e.hue} state={e.status === "active" ? "listening" : "idle"} />
                <h3 className="mt-3 font-display text-lg font-semibold">{e.name}</h3>
                <p className="text-sm text-muted">{t.industries.list[e.industry as keyof typeof t.industries.list] ?? e.industry}</p>
                <div className="mt-3 flex gap-1.5">
                  <Badge tone={statusTone(e.status)}>{e.status}</Badge>
                  <Badge tone="violet">{DIALECT_LABELS[e.dialect as keyof typeof DIALECT_LABELS]?.[locale] ?? e.dialect}</Badge>
                </div>
                {e.satisfaction > 0 && <p className="mt-4 text-xs text-muted">{e.callsToday} {t.dash.callsToday} · {e.satisfaction}% CSAT</p>}
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </>
  );
}
