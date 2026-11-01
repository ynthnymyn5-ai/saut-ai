"use client";
import { Pause, Play, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SoMascot, type VoiceState } from "@/components/brand/SoMascot";
import { Badge, Button, Card, ConfirmDialog, PageHeader, statusTone } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { ConversationPanel } from "@/components/voice/ConversationPanel";
import { RealtimeVoice } from "@/components/voice/RealtimeVoice";
import { useI18n } from "@/lib/i18n/client";
import { DIALECT_LABELS } from "./labels";
import { AgentConfig } from "@/components/os/AgentConfig";

type Emp = { id: string; name: string; industry: string; dialect: string; voice: string; status: string; hue: number; businessName?: string };

export function EmployeeDetail({ emp, demo }: { emp: Emp; demo: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [state, setState] = useState<VoiceState>("idle");
  const [del, setDel] = useState(false);

  async function act(method: "PATCH" | "DELETE", body?: object) {
    const res = await fetch(`/api/employees/${emp.id}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast({ kind: "error", title: data?.error?.message ?? "Failed" });
    if (data.demo) return toast({ kind: "info", title: locale === "ar" ? "وضع تجريبي — لم يتغير شيء" : "Demo mode — nothing changed" });
    toast({ kind: "success", title: locale === "ar" ? "تم" : "Done" });
    if (method === "DELETE") router.push("/dashboard/employees");
    router.refresh();
  }

  const employee = { name: emp.name, industry: emp.industry, dialect: emp.dialect, voice: emp.voice, businessInfo: { businessName: emp.businessName ?? "Layali Café", description: "", address: "", hours: "", faqs: "" } };

  return (
    <>
      <PageHeader
        title={emp.name}
        demo={demo}
        actions={
          <>
            {emp.status === "active"
              ? <Button variant="outline" onClick={() => act("PATCH", { status: "paused" })}><Pause className="h-4 w-4" />{locale === "ar" ? "إيقاف مؤقت" : "Pause"}</Button>
              : <Button variant="outline" onClick={() => act("PATCH", { status: "active" })}><Play className="h-4 w-4" />{locale === "ar" ? "تفعيل" : "Activate"}</Button>}
            <Button variant="ghost" onClick={() => setDel(true)}><Trash2 className="h-4 w-4 text-rose-300" /></Button>
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[280px_1fr_280px]">
        <Card className="flex flex-col items-center text-center">
          <SoMascot size={150} hue={emp.hue} state={state} />
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            <Badge tone={statusTone(emp.status)}>{emp.status}</Badge>
            <Badge tone="violet">{DIALECT_LABELS[emp.dialect as keyof typeof DIALECT_LABELS]?.[locale]}</Badge>
            <Badge tone="blue">{emp.voice}</Badge>
          </div>
          <p className="mt-3 text-sm text-muted">{t.industries.list[emp.industry as keyof typeof t.industries.list]}</p>
        </Card>
        <ConversationPanel mode="live" employee={employee} employeeId={demo ? undefined : emp.id} hue={emp.hue} onStateChange={setState} />
        <RealtimeVoice employee={employee} hue={emp.hue} />
      </div>
      {!demo && <AgentConfig id={emp.id} />}
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={() => act("DELETE")} danger
        title={locale === "ar" ? `حذف ${emp.name}؟` : `Delete ${emp.name}?`}
        body={locale === "ar" ? "سيتوقف عن الرد فوراً. لا يمكن التراجع." : "It will stop answering immediately. This can't be undone."}
        confirmLabel={t.common.delete} />
    </>
  );
}
