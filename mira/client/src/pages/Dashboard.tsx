/**
 * Dashboard: Mira's orb (Chief of Staff) in the centre, the nine specialist
 * agents in a circle, connected by glowing lines. Agents Mira delegated to in
 * the last turn light up with a travelling pulse.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AGENTS } from "@shared/agents";
import { Orb } from "../components/Orb";
import { Composer } from "../components/Conversation";
import { Icon } from "../components/ui";
import { useI18n } from "../i18n";
import { useData, useMira } from "../lib/store";
import { api } from "../lib/api";

type Overview = Record<string, { label: string; value: number; alert?: number; currency?: string }>;

export function DashboardPage() {
  const { t, lang, fmtMoney } = useI18n();
  const { orbState, lastDelegations } = useMira();
  const nav = useNavigate();
  const [overview] = useData(() => api.get<Overview>("/api/overview"));
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(600);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(([e]) => setSize(Math.min(e.contentRect.width, 680)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ring = AGENTS.filter((a) => a.id !== "chief");
  const center = size / 2;
  const radius = size * (size < 420 ? 0.4 : 0.38);
  const node = size < 420 ? 58 : 76;
  const orbSize = size * 0.42;
  const pos = ring.map((_, i) => {
    const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
    return { x: center + Math.cos(a) * radius, y: center + Math.sin(a) * radius };
  });

  const badge = (id: string) => {
    const o = overview?.[id];
    if (!o) return null;
    return o.currency ? fmtMoney(o.value, o.currency) : String(o.value);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 md:px-8 md:pt-10">
      <div className="mb-2 text-center">
        <h1 className="text-xl font-semibold md:text-2xl">{t.dashboard.title}</h1>
        <p className="mt-1 text-sm text-zinc-400">{t.dashboard.subtitle}</p>
      </div>

      <div ref={wrap} className="mx-auto w-full max-w-[680px]">
        <div className="relative mx-auto" style={{ width: size, height: size }}>
          {/* connecting lines */}
          <svg className="absolute inset-0" width={size} height={size} aria-hidden>
            <defs>
              <linearGradient id="line" x1="0" x2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#fb923c" stopOpacity="0.5" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(168,85,247,.12)" strokeDasharray="2 6" />
            {pos.map((p, i) => {
              const active = lastDelegations.includes(ring[i].id);
              return (
                <g key={ring[i].id}>
                  <line x1={center} y1={center} x2={p.x} y2={p.y} stroke={active ? ring[i].color : "url(#line)"} strokeOpacity={active ? 1 : 0.35} strokeWidth={active ? 2.2 : 1.2} filter="url(#glow)" />
                  <circle r={active ? 4 : 2.2} fill={active ? ring[i].color : "#fb923c"} filter="url(#glow)">
                    <animateMotion dur={`${active ? 1.2 : 3 + (i % 4) * 0.6}s`} repeatCount="indefinite" path={`M${center},${center} L${p.x},${p.y}`} />
                  </circle>
                </g>
              );
            })}
          </svg>

          {/* centre orb = Chief of Staff */}
          <div className="absolute flex flex-col items-center" style={{ left: center - orbSize / 2, top: center - orbSize / 2, width: orbSize }}>
            <Orb state={orbState} size={orbSize} onClick={() => nav("/agents/chief")} />
          </div>
          <button onClick={() => nav("/agents/chief")} className="absolute -translate-x-1/2 whitespace-nowrap rounded-full border border-neon-purple/40 bg-black/50 px-3 py-1 text-[11px] font-medium text-violet-100 backdrop-blur" style={{ left: center, top: center + orbSize / 2 - 8 }}>
            {AGENTS[0].name[lang]}
            {overview?.chief?.value ? <span className="ms-1.5 text-neon-orange">· {overview.chief.value} {t.chief.unread}</span> : null}
          </button>

          {/* agent modules */}
          {ring.map((a, i) => {
            const active = lastDelegations.includes(a.id);
            const b = badge(a.id);
            const alert = overview?.[a.id]?.alert;
            return (
              <motion.button
                key={a.id}
                onClick={() => nav(`/agents/${a.id}`)}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: active ? 1.08 : 1 }}
                transition={{ delay: i * 0.04, type: "spring", stiffness: 260, damping: 20 }}
                whileHover={{ scale: 1.1 }}
                className="group absolute flex flex-col items-center gap-1"
                style={{ left: pos[i].x - node / 2, top: pos[i].y - node / 2, width: node }}
                aria-label={a.name[lang]}
              >
                <span
                  className="glass relative grid place-items-center rounded-2xl transition"
                  style={{ width: node, height: node, borderColor: `${a.color}66`, boxShadow: active ? `0 0 28px ${a.color}` : `0 0 16px ${a.color}33` }}
                >
                  <Icon name={a.icon} className={size < 420 ? "h-6 w-6" : "h-7 w-7"} style={{ color: a.color }} />
                  {alert ? <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-neon-orange px-1 text-[10px] font-bold text-black">{alert}</span> : null}
                </span>
                <span className="w-[110px] text-center text-[10.5px] font-medium leading-tight text-zinc-200 sm:text-xs">{a.name[lang]}</span>
                {b !== null && <span className="text-[10px] text-zinc-500">{b}</span>}
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-2xl">
        <Composer />
      </div>

      {/* list fallback for quick scanning */}
      <div className="mx-auto mt-8 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {AGENTS.map((a) => (
          <button key={a.id} onClick={() => nav(`/agents/${a.id}`)} className="glass rounded-2xl p-3 text-start transition hover:-translate-y-0.5 hover:border-white/20">
            <Icon name={a.icon} className="h-5 w-5" style={{ color: a.color }} />
            <p className="mt-2 text-sm font-medium">{a.name[lang]}</p>
            <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">{a.tagline[lang]}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
