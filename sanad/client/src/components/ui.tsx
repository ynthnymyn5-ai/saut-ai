/** Small design-system primitives: glass cards, modal, icons, markdown, chips. */
import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import * as Icons from "lucide-react";
import clsx from "clsx";

export const cx = clsx;

export function Card({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("glass rounded-2xl", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action, icon }: { children: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
        {icon}
        {children}
      </h2>
      {action}
    </div>
  );
}

/** Resolve a lucide icon by name (used for agent metadata). */
export function Icon({ name, className = "h-5 w-5", style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[name] ?? Icons.Sparkles;
  return <C className={className} style={style} />;
}

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cx("glass-strong max-h-[90vh] w-full overflow-y-auto rounded-t-3xl p-5 shadow-glow sm:rounded-3xl scrollbar-thin", wide ? "sm:max-w-2xl" : "sm:max-w-md")}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            {title && (
              <div className="mb-4 flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold">{title}</h3>
                <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">{children}</div>;
}

export const PRIORITY_STYLE: Record<string, string> = {
  urgent: "border-red-400/40 bg-red-500/15 text-red-200",
  high: "border-orange-400/40 bg-orange-500/15 text-orange-200",
  medium: "border-violet-400/30 bg-violet-500/10 text-violet-200",
  low: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
};

export const STAGE_STYLE: Record<string, string> = {
  new: "border-sky-400/30 bg-sky-500/10 text-sky-200",
  contacted: "border-violet-400/30 bg-violet-500/10 text-violet-200",
  qualified: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200",
  proposal: "border-orange-400/40 bg-orange-500/15 text-orange-200",
  won: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  lost: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
};

// ─── Minimal, safe markdown renderer ─────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s: string) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
}

export function markdownToHtml(md: string): string {
  const out: string[] = [];
  const blocks = md.replace(/\r/g, "").split(/```/);
  blocks.forEach((block, i) => {
    if (i % 2 === 1) {
      const [first, ...rest] = block.split("\n");
      const code = /^[\w+-]*$/.test(first.trim()) ? rest.join("\n") : block;
      out.push(`<pre><code>${esc(code.replace(/\n$/, ""))}</code></pre>`);
      return;
    }
    let list: "ul" | "ol" | null = null;
    const close = () => {
      if (list) out.push(`</${list}>`);
      list = null;
    };
    for (const raw of block.split("\n")) {
      const line = raw.trimEnd();
      const ul = line.match(/^\s*[-*•]\s+(.*)/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
      const h = line.match(/^(#{1,3})\s+(.*)/);
      if (ul || ol) {
        const kind = ul ? "ul" : "ol";
        if (list !== kind) {
          close();
          out.push(`<${kind}>`);
          list = kind;
        }
        out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
      } else {
        close();
        if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
        else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
      }
    }
    close();
  });
  return out.join("");
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return <div dir="auto" className={cx("md text-sm leading-relaxed", className)} dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }} />;
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <span className={cx("inline-block animate-spin rounded-full border-2 border-white/20 border-t-neon-purple", className)} />;
}

/** <input type="datetime-local"> value from ISO, in the browser's timezone */
export const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
