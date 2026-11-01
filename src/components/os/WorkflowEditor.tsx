"use client";
import { ArrowDown, ArrowUp, GitBranch, GripVertical, Play, Plus, Power, Save, Trash2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Card, ConfirmDialog, PageHeader, Skeleton } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDate } from "@/lib/utils";
import { ACTION_LABELS, CONDITION_LABELS, INTENTS, TRIGGER_LABELS } from "./automation-labels";
import { ErrorNote, useApi, useMutate, useTr } from "./shared";

type Node = { key: string; kind: "condition" | "action"; type: string; config: Record<string, unknown>; parent_key: string | null; branch: "yes" | "no" | null; position: number };
type Exec = { id: string; status: string; steps: { key: string; type: string; outcome: string; note?: string }[]; error: string | null; started_at: string };
type Resp = { workflow: { id: string; name: string; trigger: string; enabled: boolean; version: number }; nodes: Node[]; executions: Exec[] };

let seq = 0;
const newKey = (t: string) => `${t.slice(0, 20)}_${Date.now().toString(36)}${seq++}`;

export function WorkflowEditor({ id, canEdit }: { id: string; canEdit: boolean }) {
  const tr = useTr();
  const { locale } = useI18n();
  const L = (m: Record<string, [string, string]>, k: string) => (m[k] ?? [k, k])[locale === "ar" ? 1 : 0];
  const router = useRouter();
  const mutate = useMutate();
  const { data, error, loading, reload } = useApi<Resp>(`/api/workflows/${id}`);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("call_received");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [dirty, setDirty] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [test, setTest] = useState<{ status: string; log: Exec["steps"] } | null>(null);
  const [sample, setSample] = useState({ intent: "booking", channel: "phone", text: "", phone: "+96550000000" });
  const [del, setDel] = useState(false);

  useEffect(() => {
    if (data?.workflow) { setName(data.workflow.name); setTrigger(data.workflow.trigger); setNodes(data.nodes); setDirty(false); }
  }, [data]);

  const change = (n: Node[]) => { setNodes(n); setDirty(true); };
  const siblings = (parent: string | null, branch: "yes" | "no" | null) => nodes.filter((n) => n.parent_key === parent && (parent === null || n.branch === branch)).sort((a, b) => a.position - b.position);
  const add = (kind: Node["kind"], parent: string | null, branch: Node["branch"]) => {
    const type = kind === "condition" ? "intent_is" : "notify_owner";
    change([...nodes, { key: newKey(type), kind, type, config: kind === "condition" ? { values: ["booking"] } : { title: tr("New activity", "نشاط جديد") }, parent_key: parent, branch, position: siblings(parent, branch).length }]);
  };
  const remove = (key: string) => {
    const kill = new Set([key]);
    let grew = true;
    while (grew) { grew = false; for (const n of nodes) if (n.parent_key && kill.has(n.parent_key) && !kill.has(n.key)) { kill.add(n.key); grew = true; } }
    change(nodes.filter((n) => !kill.has(n.key)));
  };
  const reorder = (list: Node[], from: number, to: number) => {
    if (to < 0 || to >= list.length) return;
    const arr = [...list]; const [m] = arr.splice(from, 1); arr.splice(to, 0, m);
    const pos = Object.fromEntries(arr.map((n, i) => [n.key, i]));
    change(nodes.map((n) => (n.key in pos ? { ...n, position: pos[n.key] } : n)));
  };
  const update = (key: string, patch: Partial<Node>) => change(nodes.map((n) => (n.key === key ? { ...n, ...patch } : n)));

  const save = async () => {
    const r = await mutate(`/api/workflows/${id}`, "PUT", { name, trigger, nodes: nodes.map((n) => ({ ...n })) }, tr("Saved", "تم الحفظ"));
    if (r) { setDirty(false); reload(); }
  };

  const renderList = (parent: string | null, branch: Node["branch"], depth: number): React.ReactNode => {
    const list = siblings(parent, branch);
    return (
      <div className="space-y-2">
        {list.map((n, i) => (
          <div key={n.key}
            draggable={canEdit}
            onDragStart={() => setDrag(n.key)}
            onDragOver={(e) => { if (drag && list.some((x) => x.key === drag)) e.preventDefault(); }}
            onDrop={() => { const from = list.findIndex((x) => x.key === drag); if (from >= 0) reorder(list, from, i); setDrag(null); }}
            className={cn("rounded-2xl border p-3", n.kind === "condition" ? "border-amber-300/30 bg-amber-300/[0.04]" : "border-line bg-white/[0.03]", drag === n.key && "opacity-50")}>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && <GripVertical className="h-4 w-4 cursor-grab text-muted" aria-hidden />}
              {n.kind === "condition" ? <GitBranch className="h-4 w-4 text-amber-300" /> : <Zap className="h-4 w-4 text-violet-soft" />}
              <select aria-label={tr("Step type", "نوع الخطوة")} disabled={!canEdit} value={n.type} onChange={(e) => update(n.key, { type: e.target.value, config: {} })} className="input w-auto min-w-0 flex-1 py-1.5 text-sm font-semibold">
                {Object.keys(n.kind === "condition" ? CONDITION_LABELS : ACTION_LABELS).map((t) => <option key={t} value={t}>{L(n.kind === "condition" ? CONDITION_LABELS : ACTION_LABELS, t)}</option>)}
              </select>
              {canEdit && (
                <span className="flex gap-1">
                  <button type="button" className="rounded-lg p-1.5 hover:bg-white/5" aria-label="Move up" onClick={() => reorder(list, i, i - 1)}><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" className="rounded-lg p-1.5 hover:bg-white/5" aria-label="Move down" onClick={() => reorder(list, i, i + 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" className="rounded-lg p-1.5 text-rose-300 hover:bg-rose-400/10" aria-label="Delete step" onClick={() => remove(n.key)}><Trash2 className="h-3.5 w-3.5" /></button>
                </span>
              )}
            </div>
            <ConfigFields node={n} disabled={!canEdit} onChange={(config) => update(n.key, { config })} />
            {n.kind === "condition" && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {(["yes", "no"] as const).map((b) => (
                  <div key={b} className="rounded-xl border border-dashed border-line p-2.5">
                    <Badge tone={b === "yes" ? "green" : "red"} className="mb-2">{b === "yes" ? tr("If yes", "إذا نعم") : tr("If no", "إذا لا")}</Badge>
                    {renderList(n.key, b, depth + 1)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {canEdit && depth < 4 && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => add("action", parent, branch)} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs text-muted hover:border-violet/50 hover:text-white"><Plus className="h-3 w-3" />{tr("Action", "إجراء")}</button>
            <button type="button" onClick={() => add("condition", parent, branch)} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs text-muted hover:border-amber-300/50 hover:text-white"><GitBranch className="h-3 w-3" />{tr("Condition", "شرط")}</button>
          </div>
        )}
      </div>
    );
  };

  if (loading) return <Skeleton className="h-96" />;
  if (!data?.workflow) return <ErrorNote error={error ?? tr("Not found", "غير موجود")} />;

  return (
    <>
      <PageHeader
        title={name || tr("Automation", "أتمتة")}
        subtitle={`v${data.workflow.version}${dirty ? ` · ${tr("unsaved changes", "تغييرات غير محفوظة")}` : ""}`}
        actions={canEdit && (
          <>
            <Button variant="outline" onClick={async () => { if (await mutate(`/api/workflows/${id}`, "POST", { action: data.workflow.enabled ? "disable" : "enable" }, data.workflow.enabled ? tr("Disabled", "تم التعطيل") : tr("Enabled", "تم التفعيل"))) reload(); }} disabled={dirty}>
              <Power className="h-4 w-4" />{data.workflow.enabled ? tr("Disable", "تعطيل") : tr("Enable", "تفعيل")}
            </Button>
            <Button onClick={save} disabled={!dirty}><Save className="h-4 w-4" />{tr("Save", "حفظ")}</Button>
          </>
        )}
      />
      <ErrorNote error={error} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="wf-name">{tr("Name", "الاسم")}</label><input id="wf-name" className="input" dir="auto" value={name} disabled={!canEdit} onChange={(e) => { setName(e.target.value); setDirty(true); }} /></div>
            <div><label className="label" htmlFor="wf-trigger">{tr("When this happens", "عندما يحدث")}</label>
              <select id="wf-trigger" className="input" value={trigger} disabled={!canEdit} onChange={(e) => { setTrigger(e.target.value); setDirty(true); }}>
                {Object.keys(TRIGGER_LABELS).map((t) => <option key={t} value={t}>{L(TRIGGER_LABELS, t)}</option>)}
              </select></div>
          </div>
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-electric/10 px-3 py-2 text-sm text-electric"><Zap className="h-4 w-4" />{L(TRIGGER_LABELS, trigger)}</div>
          {renderList(null, null, 0)}
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-semibold">{tr("Test run", "تشغيل تجريبي")}</h2>
            <p className="mb-3 text-xs text-muted">{tr("Evaluates the conditions and shows which actions would run. Nothing is sent or saved.", "يقيّم الشروط ويعرض الإجراءات التي ستُنفّذ. لا يُرسل أو يُحفظ أي شيء.")}</p>
            <div className="grid gap-2">
              <select aria-label="intent" className="input" value={sample.intent} onChange={(e) => setSample({ ...sample, intent: e.target.value })}>{INTENTS.map(([k, ar]) => <option key={k} value={k}>{locale === "ar" ? ar : k}</option>)}</select>
              <select aria-label="channel" className="input" value={sample.channel} onChange={(e) => setSample({ ...sample, channel: e.target.value })}>{["phone", "whatsapp", "web_chat"].map((c) => <option key={c}>{c}</option>)}</select>
              <input aria-label="message" className="input" dir="auto" placeholder={tr("Sample message", "رسالة تجريبية")} value={sample.text} onChange={(e) => setSample({ ...sample, text: e.target.value })} />
              <Button variant="outline" disabled={dirty} onClick={async () => { const r = await mutate(`/api/workflows/${id}`, "POST", { action: "test", sample: { ...sample, within_hours: true } }); if (r) setTest(r); }}><Play className="h-4 w-4" />{dirty ? tr("Save first", "احفظ أولاً") : tr("Run test", "تشغيل الاختبار")}</Button>
            </div>
            {test && <StepLog steps={test.log} status={test.status} L={L} />}
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">{tr("Execution history", "سجل التنفيذ")}</h2>
            {data.executions.length === 0 ? <p className="text-sm text-muted">{tr("No runs yet.", "لا توجد عمليات تشغيل بعد.")}</p> : (
              <ul className="space-y-2">
                {data.executions.map((e) => (
                  <li key={e.id}>
                    <details className="rounded-xl border border-line p-2.5">
                      <summary className="flex cursor-pointer items-center gap-2 text-sm"><Badge tone={e.status === "succeeded" ? "green" : e.status === "failed" ? "red" : "amber"}>{e.status}</Badge><span className="text-xs text-muted">{formatDate(e.started_at, locale)}</span></summary>
                      {e.error && <p className="mt-2 text-xs text-rose-300">{e.error}</p>}
                      <StepLog steps={e.steps} status={e.status} L={L} />
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {canEdit && <Button variant="ghost" className="text-rose-300" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" />{tr("Delete automation", "حذف الأتمتة")}</Button>}
        </div>
      </div>
      <ConfirmDialog open={del} danger onClose={() => setDel(false)} title={tr("Delete this automation?", "حذف هذه الأتمتة؟")} body={tr("Its history is deleted too.", "سيُحذف سجلها أيضاً.")} onConfirm={async () => { if (await mutate(`/api/workflows/${id}`, "DELETE")) router.push("/dashboard/automations"); }} />
    </>
  );
}

function StepLog({ steps, L }: { steps: Exec["steps"]; status: string; L: (m: Record<string, [string, string]>, k: string) => string }) {
  return (
    <ol className="mt-3 space-y-1.5">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2 text-xs">
          <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", { ok: "bg-emerald-400", yes: "bg-emerald-400", no: "bg-white/40", failed: "bg-rose-400", skipped: "bg-white/20", waiting_confirmation: "bg-amber-300" }[s.outcome] ?? "bg-white/20")} />
          <span><b className="font-medium">{L({ ...ACTION_LABELS, ...CONDITION_LABELS }, s.type)}</b> · {s.outcome}{s.note ? <span className="block text-muted">{s.note}</span> : null}</span>
        </li>
      ))}
    </ol>
  );
}

function ConfigFields({ node, onChange, disabled }: { node: Node; onChange: (c: Record<string, unknown>) => void; disabled: boolean }) {
  const tr = useTr();
  const { locale } = useI18n();
  const c = node.config;
  const text = (k: string, ph: string, type = "text") => (
    <input aria-label={k} disabled={disabled} type={type} dir="auto" className="input mt-2 py-1.5 text-sm" placeholder={ph} value={String(c[k] ?? "")} onChange={(e) => onChange({ ...c, [k]: type === "number" ? Number(e.target.value) : e.target.value })} />
  );
  switch (node.type) {
    case "intent_is": {
      const vals = (c.values as string[]) ?? (c.value ? [String(c.value)] : []);
      return (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {INTENTS.map(([k, ar]) => (
            <button key={k} type="button" disabled={disabled} onClick={() => onChange({ values: vals.includes(k) ? vals.filter((v) => v !== k) : [...vals, k] })}
              className={cn("rounded-full border px-2.5 py-1 text-xs", vals.includes(k) ? "border-violet bg-violet/20" : "border-line text-muted")}>{locale === "ar" ? ar : k.replace("_", " ")}</button>
          ))}
        </div>
      );
    }
    case "channel_is": return <select aria-label="channel" disabled={disabled} className="input mt-2 py-1.5 text-sm" value={String(c.value ?? "phone")} onChange={(e) => onChange({ value: e.target.value })}>{["phone", "whatsapp", "web_chat"].map((v) => <option key={v}>{v}</option>)}</select>;
    case "customer_is_new":
    case "within_hours": return <select aria-label={node.type} disabled={disabled} className="input mt-2 py-1.5 text-sm" value={String(c.value !== false)} onChange={(e) => onChange({ value: e.target.value === "true" })}><option value="true">{tr("Yes", "نعم")}</option><option value="false">{tr("No", "لا")}</option></select>;
    case "has_tag": return text("value", "VIP");
    case "text_contains": return text("value", tr("comma-separated words", "كلمات مفصولة بفواصل"));
    case "lead_score_at_least": return text("value", "60", "number");
    case "send_whatsapp": return <>{text("template", tr("approved template name, e.g. booking_confirmation", "اسم القالب المعتمد"))}<p className="mt-1 text-[11px] text-muted">{tr("Outside the 24-hour window WhatsApp only allows approved templates.", "خارج نافذة ٢٤ ساعة يسمح واتساب بالقوالب المعتمدة فقط.")}</p></>;
    case "notify_owner": return text("title", tr("Notification title", "عنوان التنبيه"));
    case "create_task": return <div className="grid gap-2 sm:grid-cols-3">{text("title", tr("Task title", "عنوان المهمة"))}{text("due_minutes", tr("Due in minutes", "الاستحقاق بالدقائق"), "number")}<select aria-label="delegate" disabled={disabled} className="input mt-2 py-1.5 text-sm" value={String(c.delegate_to_role ?? "")} onChange={(e) => onChange({ ...c, delegate_to_role: e.target.value || undefined })}><option value="">{tr("Staff", "الموظفين")}</option>{["receptionist", "sales", "support", "booking"].map((r) => <option key={r} value={r}>SO {r}</option>)}</select></div>;
    case "tag_customer": return text("value", "Complaint");
    case "escalate_to_human": return text("reason", tr("Reason", "السبب"));
    case "update_lead_stage": return <select aria-label="stage" disabled={disabled} className="input mt-2 py-1.5 text-sm" value={String(c.stage ?? "contacted")} onChange={(e) => onChange({ stage: e.target.value })}>{["new", "contacted", "interested", "qualified", "converted", "lost"].map((v) => <option key={v}>{v}</option>)}</select>;
    default: return null;
  }
}
