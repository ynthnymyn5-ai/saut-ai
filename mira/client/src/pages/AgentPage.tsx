/** Agent panel wrapper: header, direct chat with that agent, and its module. */
import { useState, type ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { agentMeta, AGENT_IDS, type AgentId } from "@shared/agents";
import { useI18n } from "../i18n";
import { Composer } from "../components/Conversation";
import { Card, Icon, Markdown } from "../components/ui";
import { ChiefPanel } from "../agents/ChiefPanel";
import { OperationsPanel } from "../agents/OperationsPanel";
import { SalesPanel } from "../agents/SalesPanel";
import { FinancePanel } from "../agents/FinancePanel";
import { MarketingPanel } from "../agents/MarketingPanel";
import { NotesPanel } from "../agents/NotesPanel";
import { MemoryPanel } from "../agents/MemoryPanel";

const PANELS: Record<AgentId, () => ReactElement> = {
  chief: ChiefPanel,
  operations: OperationsPanel,
  sales: SalesPanel,
  finance: FinancePanel,
  marketing: MarketingPanel,
  researcher: () => <NotesPanel agent="researcher" />,
  strategist: () => <NotesPanel agent="strategist" />,
  engineering: () => <NotesPanel agent="engineering" />,
  design: () => <NotesPanel agent="design" />,
  memory: MemoryPanel,
};

export function AgentPage() {
  const { id = "chief" } = useParams();
  const agentId = (AGENT_IDS.includes(id as AgentId) ? id : "chief") as AgentId;
  const a = agentMeta(agentId);
  const { t, lang } = useI18n();
  const [reply, setReply] = useState<string | null>(null);
  const Panel = PANELS[agentId];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-5 md:px-8 md:pt-8" key={agentId}>
      <Link to="/dashboard" className="mb-4 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white">
        <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {t.nav.dashboard}
      </Link>
      <div className="mb-5 flex items-center gap-3">
        <span className="glass grid h-12 w-12 place-items-center rounded-2xl" style={{ borderColor: `${a.color}66`, boxShadow: `0 0 22px ${a.color}44` }}>
          <Icon name={a.icon} className="h-6 w-6" style={{ color: a.color }} />
        </span>
        <div>
          <h1 className="text-xl font-semibold">{a.name[lang]}</h1>
          <p className="text-sm text-zinc-400">{a.tagline[lang]}</p>
        </div>
      </div>

      <div className="mb-6 space-y-3">
        <Composer agentId={agentId} placeholder={t.chat.askAgent(a.name[lang])} onSent={setReply} />
        {reply && (
          <Card className="relative p-4" style={{ borderColor: `${a.color}44` }}>
            <button onClick={() => setReply(null)} className="absolute end-3 top-2 text-xs text-zinc-500 hover:text-zinc-200">
              {t.common.close}
            </button>
            <Markdown text={reply} />
          </Card>
        )}
      </div>

      <Panel />
    </div>
  );
}
