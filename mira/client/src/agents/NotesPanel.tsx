/**
 * Shared panel for knowledge agents:
 *   researcher  → research reports with sources
 *   strategist  → decisions/plans with pros & cons
 *   engineering → snippets and specs (code blocks, copy)
 *   design      → briefs and moodboards (palette swatches)
 */
import { useState } from "react";
import { Plus, Trash2, ExternalLink, ThumbsUp, ThumbsDown, Copy } from "lucide-react";
import { api } from "../lib/api";
import { useData, useMira } from "../lib/store";
import { useI18n } from "../i18n";
import { Card, Field, Markdown, Modal, cx, Empty } from "../components/ui";
import { useConfirm } from "../components/ConfirmModal";

type NoteAgent = "researcher" | "strategist" | "engineering" | "design";
interface Note {
  id: number;
  agentId: NoteAgent;
  kind: string;
  title: string;
  body: string;
  codeLanguage: string | null;
  tags: string[];
  data: { sources?: { title: string; url: string }[]; pros?: string[]; cons?: string[]; colors?: string[] } | null;
  updatedAt: string;
}

const KINDS: Record<NoteAgent, string[]> = {
  researcher: ["research", "note"],
  strategist: ["decision", "plan", "note"],
  engineering: ["snippet", "spec", "note"],
  design: ["brief", "moodboard", "note"],
};

export function NotesPanel({ agent }: { agent: NoteAgent }) {
  const { t, fmtDate } = useI18n();
  const { toast } = useMira();
  const ask = useConfirm();
  const [notes, reload] = useData(() => api.get<Note[]>(`/api/notes?agent=${agent}`), [agent]);
  const [open, setOpen] = useState<Note | null>(null);
  const [draft, setDraft] = useState<Partial<Note> | null>(null);
  const [kind, setKind] = useState("all");

  const shown = (notes ?? []).filter((n) => kind === "all" || n.kind === kind);

  const save = async () => {
    if (!draft?.title) return;
    const body = { agentId: agent, kind: draft.kind ?? KINDS[agent][0], title: draft.title, body: draft.body ?? "", codeLanguage: draft.codeLanguage ?? null, tags: draft.tags ?? [], data: draft.data ?? null };
    if (draft.id) await api.patch(`/api/notes/${draft.id}`, body);
    else await api.post("/api/notes", body);
    setDraft(null);
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl bg-white/5 p-1 text-xs">
          {["all", ...KINDS[agent]].map((k) => (
            <button key={k} onClick={() => setKind(k)} className={cx("rounded-lg px-3 py-1 capitalize", kind === k ? "bg-white/10 text-white" : "text-zinc-400")}>
              {k === "all" ? t.common.all : k}
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={() => setDraft({ kind: KINDS[agent][0] })}>
          <Plus className="h-4 w-4" /> {t.notes.newNote}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((n) => (
          <Card key={n.id} className="cursor-pointer p-4 transition hover:-translate-y-0.5 hover:border-white/20" onClick={() => setOpen(n)}>
            <div className="mb-2 flex items-center justify-between">
              <span className="chip border-white/10 capitalize text-zinc-300">{n.kind}</span>
              <span className="text-[10px] text-zinc-500">{fmtDate(n.updatedAt, { day: "numeric", month: "short" })}</span>
            </div>
            <h3 dir="auto" className="font-medium">{n.title}</h3>
            {n.data?.colors?.length ? (
              <div className="mt-3 flex overflow-hidden rounded-lg">
                {n.data.colors.map((c) => <span key={c} className="h-8 flex-1" style={{ background: c }} title={c} />)}
              </div>
            ) : (
              <p dir="auto" className="mt-1.5 line-clamp-3 text-xs text-zinc-400">{n.body.replace(/[#*`]/g, "").slice(0, 220)}</p>
            )}
            {n.data?.pros?.length ? (
              <p className="mt-2 text-[11px] text-zinc-500">
                <span className="text-emerald-300">+{n.data.pros.length}</span> / <span className="text-red-300">−{n.data.cons?.length ?? 0}</span>
              </p>
            ) : null}
            {n.data?.sources?.length ? <p className="mt-2 text-[11px] text-sky-300">{n.data.sources.length} {t.notes.sources.toLowerCase()}</p> : null}
          </Card>
        ))}
      </div>
      {!shown.length && <Empty>{t.common.empty}</Empty>}

      {/* Viewer */}
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.title} wide>
        {open && (
          <div className="space-y-4">
            {open.data?.colors?.length ? (
              <div className="grid grid-cols-5 gap-2">
                {open.data.colors.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      void navigator.clipboard.writeText(c);
                      toast(`${c} ${t.common.copied}`, "success");
                    }}
                    className="overflow-hidden rounded-xl border border-white/10 text-start"
                  >
                    <span className="block h-16" style={{ background: c }} />
                    <span className="block px-2 py-1 font-mono text-[10px] text-zinc-300">{c}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <Markdown text={open.body} />
            {open.agentId === "engineering" && open.body.includes("```") && (
              <button
                className="btn-ghost text-xs"
                onClick={() => {
                  const code = open.body.split("```")[1]?.replace(/^[\w+-]*\n/, "") ?? open.body;
                  void navigator.clipboard.writeText(code);
                  toast(t.common.copied, "success");
                }}
              >
                <Copy className="h-3.5 w-3.5" /> {t.common.copy}
              </button>
            )}
            {(open.data?.pros?.length || open.data?.cons?.length) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3">
                  <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-emerald-200"><ThumbsUp className="h-3.5 w-3.5" /> {t.notes.pros}</p>
                  <ul className="space-y-1 text-sm">{open.data?.pros?.map((p) => <li key={p} dir="auto">• {p}</li>)}</ul>
                </div>
                <div className="rounded-xl border border-red-400/20 bg-red-500/5 p-3">
                  <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-red-200"><ThumbsDown className="h-3.5 w-3.5" /> {t.notes.cons}</p>
                  <ul className="space-y-1 text-sm">{open.data?.cons?.map((p) => <li key={p} dir="auto">• {p}</li>)}</ul>
                </div>
              </div>
            )}
            {open.data?.sources?.length ? (
              <div>
                <p className="label mb-2">{t.notes.sources}</p>
                <ul className="space-y-1">
                  {open.data.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-violet-300 hover:underline">
                        <ExternalLink className="h-3 w-3" /> {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex gap-2 border-t border-white/5 pt-3">
              <button
                className="btn-danger"
                aria-label={t.common.delete}
                onClick={async () => {
                  if (await ask({ body: open.title })) {
                    await api.del(`/api/notes/${open.id}`);
                    setOpen(null);
                    reload();
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                className="btn-ghost flex-1"
                onClick={() => {
                  setDraft(open);
                  setOpen(null);
                }}
              >
                {t.common.edit}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Editor */}
      <Modal open={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.id ? t.common.edit : t.notes.newNote} wide>
        {draft && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label={t.ops.title}>
                  <input dir="auto" autoFocus required className="input" value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </Field>
              </div>
              <Field label={t.notes.kind}>
                <select className="input capitalize" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                  {KINDS[agent].map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </Field>
            </div>
            <Field label={t.notes.body}>
              <textarea dir="auto" className="input min-h-[200px] font-mono text-xs" value={draft.body ?? ""} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </Field>
            {agent === "design" && (
              <Field label={`${t.notes.palette} (#hex, comma separated)`}>
                <input className="input font-mono" value={(draft.data?.colors ?? []).join(", ")} onChange={(e) => setDraft({ ...draft, data: { ...draft.data, colors: e.target.value.split(/[,\s]+/).filter((c) => /^#[0-9a-f]{3,8}$/i.test(c)) } })} />
              </Field>
            )}
            {agent === "strategist" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={`${t.notes.pros} (one per line)`}>
                  <textarea dir="auto" className="input min-h-[80px]" value={(draft.data?.pros ?? []).join("\n")} onChange={(e) => setDraft({ ...draft, data: { ...draft.data, pros: e.target.value.split("\n").filter(Boolean) } })} />
                </Field>
                <Field label={`${t.notes.cons} (one per line)`}>
                  <textarea dir="auto" className="input min-h-[80px]" value={(draft.data?.cons ?? []).join("\n")} onChange={(e) => setDraft({ ...draft, data: { ...draft.data, cons: e.target.value.split("\n").filter(Boolean) } })} />
                </Field>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button type="button" className="btn-ghost flex-1" onClick={() => setDraft(null)}>{t.common.cancel}</button>
              <button type="submit" className="btn-primary flex-1">{t.common.save}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
