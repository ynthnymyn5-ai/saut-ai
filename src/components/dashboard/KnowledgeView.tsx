"use client";
import { BookOpen, FileText, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, PageHeader, statusTone } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDate } from "@/lib/utils";

type Doc = { id: string; title: string; status: string; size: number; created_at: string; error?: string | null };
const ALLOWED = ".pdf,.txt,.md,.csv,.docx";

export function KnowledgeView({ docs: initial, demo }: { docs: Doc[]; demo: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState(initial);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [faq, setFaq] = useState("");
  const router = useRouter();
  useEffect(() => setDocs(initial), [initial]);
  // PDFs/DOCX are read in the background; refresh until none are still processing (max ~4 min).
  const processing = docs.some((d) => d.status === "processing");
  useEffect(() => {
    if (!processing || demo) return;
    let n = 0;
    const id = setInterval(() => { if (++n > 48) clearInterval(id); else router.refresh(); }, 5000);
    return () => clearInterval(id);
  }, [processing, demo, router]);
  const statusLabel = (st: string) => (locale === "ar" ? ({ ready: "جاهز", processing: "قيد القراءة…", failed: "تعذّرت القراءة", uploaded: "مرفوع" } as Record<string, string>)[st] : ({ ready: "Ready", processing: "Reading…", failed: "Couldn't read", uploaded: "Uploaded" } as Record<string, string>)[st]) ?? st;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      if (f.size > 20 * 1024 * 1024) { toast({ kind: "error", title: `${f.name}: max 20 MB` }); continue; }
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/knowledge/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ kind: "error", title: f.name, body: data?.error?.message }); continue; }
      if (data.demo) toast({ kind: "info", title: locale === "ar" ? "وضع تجريبي — لم يُرفع الملف" : "Demo mode — file not stored", body: f.name });
      else { setDocs((d) => [data.document, ...d]); toast({ kind: "success", title: locale === "ar" ? "تم الرفع" : "Uploaded", body: f.name }); }
    }
    setBusy(false);
  }

  async function saveFaq() {
    const res = await fetch("/api/knowledge/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "FAQ", text: faq }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast({ kind: "error", title: data?.error?.message ?? "Failed" });
    if (data.demo) return toast({ kind: "info", title: locale === "ar" ? "وضع تجريبي — لم يُحفظ" : "Demo mode — not saved" });
    setDocs((d) => [data.document, ...d]);
    setFaq("");
    toast({ kind: "success", title: t.common.save });
  }

  return (
    <>
      <PageHeader title={t.dash.nav.knowledge} subtitle={locale === "ar" ? "ما يعرفه موظفوك الأذكياء عن نشاطك" : "What your AI employees know about your business"} demo={demo} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
          onClick={() => input.current?.click()}
          className={cn("glass flex cursor-pointer flex-col items-center justify-center border-dashed p-10 text-center transition", drag && "border-violet bg-violet/10")}
        >
          <UploadCloud className="h-10 w-10 text-violet-soft" />
          <p className="mt-3 font-semibold">{locale === "ar" ? "اسحب الملفات هنا أو اضغط للرفع" : "Drop files here or click to upload"}</p>
          <p className="mt-1 text-xs text-muted">PDF, DOCX, TXT, MD, CSV · {locale === "ar" ? "حتى ٢٠ ميغابايت" : "up to 20 MB"}</p>
          {busy && <p className="mt-3 text-xs text-electric">{t.common.loading}</p>}
          <input ref={input} type="file" accept={ALLOWED} multiple hidden onChange={(e) => upload(e.target.files)} />
        </div>
        <Card>
          <label className="label" htmlFor="faq">{locale === "ar" ? "أضف أسئلة وأجوبة نصية" : "Add Q&A as text"}</label>
          <textarea id="faq" dir="auto" rows={6} value={faq} onChange={(e) => setFaq(e.target.value)} maxLength={20000} className="input" placeholder={locale === "ar" ? "س: هل يوجد مواقف؟\nج: نعم، مواقف مجانية خلف المبنى." : "Q: Is there parking?\nA: Yes, free parking behind the building."} />
          <Button className="mt-3" disabled={faq.trim().length < 5} onClick={saveFaq}>{t.common.save}</Button>
        </Card>
      </div>
      <h2 className="mb-3 mt-8 font-semibold">{locale === "ar" ? "المستندات" : "Documents"}</h2>
      {docs.length === 0 ? <EmptyState icon={<BookOpen className="h-6 w-6" />} title={t.dash.empty} /> : (
        <div className="space-y-2">{docs.map((d) => (
          <Card key={d.id} className="flex items-center gap-3 p-4">
            <FileText className="h-5 w-5 text-electric" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{d.title}</p><p className="text-xs text-muted">{(d.size / 1024).toFixed(0)} KB · {formatDate(d.created_at, locale)}</p>{d.error && <p className="mt-1 text-xs text-amber-300">{d.error}</p>}</div>
            <Badge tone={statusTone(d.status === "ready" ? "completed" : d.status)}>{statusLabel(d.status)}</Badge>
          </Card>))}
        </div>
      )}
    </>
  );
}
