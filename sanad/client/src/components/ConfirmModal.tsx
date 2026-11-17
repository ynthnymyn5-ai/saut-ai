/**
 * The safety net: every action that sends, deletes, pays or publishes shows
 * up here and only runs when the owner approves. Also a generic
 * `useConfirm()` dialog for deletions made directly in the panels.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { ShieldAlert, ChevronDown, Trash2 } from "lucide-react";
import { useSanad } from "../lib/store";
import { useI18n } from "../i18n";
import { Modal, Spinner } from "./ui";

export function PendingActionsModal() {
  const { pending, decide } = useSanad();
  const { t } = useI18n();
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const [showArgs, setShowArgs] = useState(false);
  const current = pending[0];

  const act = async (approve: boolean) => {
    if (!current) return;
    setBusy(approve ? "confirm" : "cancel");
    await decide(current.id, approve);
    setBusy(null);
    setShowArgs(false);
  };

  return (
    <Modal open={Boolean(current)} onClose={() => act(false)} title={<span className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-neon-orange" />{t.confirm.title}</span>}>
      {current && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-neon-orange/30 bg-neon-orange/10 p-4">
            <p dir="auto" className="text-base font-medium text-white">{current.summary}</p>
            <p className="mt-1 font-mono text-[11px] text-orange-200/70">{current.tool}</p>
          </div>
          <p className="text-sm text-zinc-400">{t.confirm.body}</p>
          <button className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200" onClick={() => setShowArgs((s) => !s)}>
            <ChevronDown className={`h-3.5 w-3.5 transition ${showArgs ? "rotate-180" : ""}`} /> {t.confirm.details}
          </button>
          {showArgs && <pre className="max-h-56 overflow-auto rounded-xl bg-black/40 p-3 text-[11px] text-zinc-300 scrollbar-thin" dir="ltr">{JSON.stringify(current.args, null, 2)}</pre>}
          {pending.length > 1 && <p className="text-xs text-zinc-500">+{pending.length - 1} more waiting</p>}
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" disabled={Boolean(busy)} onClick={() => act(false)}>
              {busy === "cancel" ? <Spinner /> : t.confirm.cancel}
            </button>
            <button className="btn-primary flex-1" disabled={Boolean(busy)} onClick={() => act(true)} autoFocus>
              {busy === "confirm" ? <Spinner /> : t.confirm.approve}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Generic "are you sure?" for UI deletions ────────────────────────────────
type Ask = (opts: { title?: string; body?: string; confirmLabel?: string }) => Promise<boolean>;
const ConfirmCtx = createContext<Ask>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [state, setState] = useState<{ title?: string; body?: string; confirmLabel?: string; resolve: (v: boolean) => void } | null>(null);
  const ask = useCallback<Ask>((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal open={Boolean(state)} onClose={() => close(false)} title={<span className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-red-300" />{state?.title ?? t.confirm.deleteTitle}</span>}>
        <p className="mb-5 text-sm text-zinc-400">{state?.body ?? t.confirm.deleteBody}</p>
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={() => close(false)}>{t.common.cancel}</button>
          <button className="btn-danger flex-1" onClick={() => close(true)} autoFocus>{state?.confirmLabel ?? t.confirm.delete}</button>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);
