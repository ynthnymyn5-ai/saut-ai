/** Operations: Kanban (To do / In progress / Done) with priorities and due dates. */
import { useState } from "react";
import { Plus, Trash2, CalendarClock, GripVertical } from "lucide-react";
import { api } from "../lib/api";
import { useData, useSanad } from "../lib/store";
import { useI18n } from "../i18n";
import { Field, Modal, PRIORITY_STYLE, cx, fromLocalInput, toLocalInput } from "../components/ui";
import { useConfirm } from "../components/ConfirmModal";

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  project: string | null;
  dueAt: string | null;
}

const COLUMNS = ["todo", "in_progress", "done"] as const;

export function OperationsPanel() {
  const { t, fmtDate } = useI18n();
  const { bump } = useSanad();
  const ask = useConfirm();
  const [tasks, reload] = useData(() => api.get<Task[]>("/api/tasks"));
  const [editing, setEditing] = useState<Partial<Task> | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const move = async (id: number, status: Task["status"]) => {
    await api.patch(`/api/tasks/${id}`, { status });
    reload();
    bump();
  };
  const save = async () => {
    if (!editing?.title) return;
    const body = { title: editing.title, description: editing.description ?? null, priority: editing.priority ?? "medium", project: editing.project ?? null, dueAt: editing.dueAt ?? null, status: editing.status ?? "todo" };
    if (editing.id) await api.patch(`/api/tasks/${editing.id}`, body);
    else await api.post("/api/tasks", body);
    setEditing(null);
    reload();
    bump();
  };
  const remove = async (task: Task) => {
    if (!(await ask({ body: `“${task.title}”` }))) return;
    await api.del(`/api/tasks/${task.id}`);
    setEditing(null);
    reload();
    bump();
  };
  const overdue = (d: string | null, s: string) => d && s !== "done" && new Date(d).getTime() < Date.now();

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => setEditing({ priority: "medium", status: "todo" })}>
          <Plus className="h-4 w-4" /> {t.ops.newTask}
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = (tasks ?? []).filter((x) => x.status === col);
          return (
            <div
              key={col}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={() => {
                if (dragId) void move(dragId, col);
                setDragId(null);
                setOver(null);
              }}
              className={cx("glass min-h-[200px] rounded-2xl p-3 transition", over === col && "border-neon-purple/60 bg-neon-purple/10")}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold">{t.ops[col]}</h3>
                <span className="rounded-full bg-white/5 px-2 text-xs text-zinc-400">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => setDragId(task.id)}
                    onClick={() => setEditing(task)}
                    className={cx("group cursor-pointer rounded-xl border border-white/5 bg-black/25 p-3 transition hover:border-white/15", task.status === "done" && "opacity-60")}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-0.5 hidden h-4 w-4 shrink-0 text-zinc-600 md:block" />
                      <p dir="auto" className={cx("flex-1 text-sm", task.status === "done" && "line-through")}>{task.title}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className={cx("chip", PRIORITY_STYLE[task.priority])}>{t.ops[task.priority]}</span>
                      {task.project && <span className="chip border-white/10 text-zinc-400">{task.project}</span>}
                      {task.dueAt && (
                        <span className={cx("chip border-transparent", overdue(task.dueAt, task.status) ? "text-red-300" : "text-zinc-400")}>
                          <CalendarClock className="h-3 w-3" /> {fmtDate(task.dueAt)}
                        </span>
                      )}
                    </div>
                    {/* touch devices: quick move buttons */}
                    <div className="mt-2 flex gap-1 md:hidden">
                      {COLUMNS.filter((c) => c !== task.status).map((c) => (
                        <button
                          key={c}
                          onClick={(e) => {
                            e.stopPropagation();
                            void move(task.id, c);
                          }}
                          className="rounded-lg border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400"
                        >
                          → {t.ops[c]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? t.common.edit : t.ops.newTask}>
        {editing && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field label={t.ops.title}>
              <input dir="auto" autoFocus className="input" value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.ops.priority}>
                <select className="input" value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value as Task["priority"] })}>
                  {(["low", "medium", "high", "urgent"] as const).map((p) => (
                    <option key={p} value={p}>{t.ops[p]}</option>
                  ))}
                </select>
              </Field>
              <Field label={t.ops.moveTo}>
                <select className="input" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as Task["status"] })}>
                  {COLUMNS.map((c) => (
                    <option key={c} value={c}>{t.ops[c]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.ops.dueAt}>
                <input type="datetime-local" className="input" value={toLocalInput(editing.dueAt)} onChange={(e) => setEditing({ ...editing, dueAt: fromLocalInput(e.target.value) })} />
              </Field>
              <Field label={t.ops.project}>
                <input dir="auto" className="input" value={editing.project ?? ""} onChange={(e) => setEditing({ ...editing, project: e.target.value })} />
              </Field>
            </div>
            <Field label={t.finance.description}>
              <textarea dir="auto" className="input min-h-[70px]" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <div className="flex gap-2 pt-1">
              {editing.id && (
                <button type="button" className="btn-danger" onClick={() => remove(editing as Task)} aria-label={t.common.delete}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button type="button" className="btn-ghost flex-1" onClick={() => setEditing(null)}>{t.common.cancel}</button>
              <button type="submit" className="btn-primary flex-1">{t.common.save}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
